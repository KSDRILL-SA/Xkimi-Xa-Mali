import { Prisma } from '@prisma/client'
import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { todaySAST } from '@/lib/date'
import { redis } from '@/lib/redis'
import { paymentGateway } from '@/integrations/payment'
import { debitAmountWithFee } from '@/lib/group-account'
import { subtractZAR } from '@/lib/money'
import { recalculateContributionStatus, invalidateContributionSummaryCache } from '@/services/contribution.service'
import { syncPrimaryGoalProgress } from '@/services/goal.service'
import { checkBudget } from '@/services/budget.service'
import { queueNotification } from '@/services/notification.service'
import { raiseOperationalAlert } from '@/services/alert.service'
import { alertOnFailure } from '@/inngest/on-failure'
import { cache, CACHE_KEYS } from '@/lib/cache'
import { env } from '@/lib/env'
import { logger } from '@xxm/observability'
import { INFRASTRUCTURE_FAILURE_PREFIX } from '@xxm/utils'
import { toTransactionStatus } from '@/lib/transaction-status'
import { recordJobHeartbeat } from '@/lib/job-heartbeat'

/**
 * Run every mandate, whatever the ones before it did.
 *
 * One member's failure must not stop the rest of the month being collected.
 * This is the last net rather than the first: a gateway failure is caught at
 * the call itself, where the mandate is still in scope and the outcome can be
 * written to the database. Anything reaching here is unexpected, so it is
 * logged with the mandate it belongs to and counted, never swallowed.
 */
export async function processMandateBatch<T>(
  mandates: T[],
  processor: (mandate: T) => Promise<unknown> | unknown,
  describe: (mandate: T) => string = () => 'unknown',
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0
  let failed = 0

  for (const mandate of mandates) {
    try {
      await processor(mandate)
      succeeded += 1
    } catch (err) {
      failed += 1
      logger.error('Debit run: unexpected error processing a mandate', {
        mandateId: describe(mandate),
        reason: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return { succeeded, failed }
}

/**
 * Inngest's `step`, narrowed to what this job uses.
 *
 * Declared so the run can be driven by a stub in a test. The orchestration is
 * where the money decisions are made, and until now none of it was reachable:
 * a gateway failure that silently skipped a member for a whole month sat here
 * through 786 passing tests, because the only thing a test could reach was the
 * batch helper around it.
 */
export type DebitStepRunner = {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>
}

export async function executeDebitRun(step: DebitStepRunner) {
  const today = await step.run('get-today', () => todaySAST())
  const [yearStr, monthStr, dayStr] = today.split('-')
  if (!yearStr || !monthStr || !dayStr) {
    throw new Error(`debit-run: unexpected date format from todaySAST(): ${today}`)
  }
  const dayOfMonth = parseInt(dayStr, 10)
  const periodYear = parseInt(yearStr, 10)
  const periodMonth = parseInt(monthStr, 10)
  const periodKey = `${yearStr}-${monthStr}`

  const mandates = await step.run('find-mandates', () =>
    db.paymentMandate.findMany({
      where: { status: 'ACTIVE', debitDay: dayOfMonth },
      // firstName is selected so a decline can address the member by name. The
      // messages that go out when things go well already do.
      include: { user: { select: { id: true, status: true, firstName: true } } },
    }),
  )

  const processableMandates = mandates.filter((mandate) => mandate.user.status === 'ACTIVE' && !!mandate.netcashMandateId)

  // Collections that did not happen, and why. Rebuilt identically on every
  // replay: Inngest memoises step errors, so the branches below take the same
  // path each time the function is re-entered.
  const notCollected: Array<{ mandateId: string; kind: 'declined' | 'infrastructure'; reason: string }> = []
  const tally = { collected: 0, awaitingSettlement: 0, skipped: 0 }

  const outcome = await processMandateBatch(processableMandates, async (mandate) => {
    // A delay the member asked for, read from the mandate rather than a cache.
    // A date still in the future means they have moved this debit, and the
    // delay handler will charge them on the day they chose. Previously this
    // was a Redis key, so with no cache configured the delay was invisible and
    // the debit went ahead on the original date regardless.
    if (mandate.delayedUntil && new Date(mandate.delayedUntil) > new Date()) {
      tally.skipped += 1
      return
    }

    const idempotencyKey = `debit:run:${mandate.id}:${periodKey}`

    // Claim the period, in one operation that either wins or loses.
    //
    // This used to read and then write: `redis.get`, a database lookup, and —
    // in a separate step — `redis.set`. Two runs overlapping both read nothing,
    // both concluded the month was uncollected, and both submitted:
    //
    //     check DB   -> none        check DB   -> none
    //     check Redis-> none        check Redis-> none
    //     set Redis                 set Redis
    //     submit debit              submit debit
    //
    // The transaction's unique `idempotencyKey` stops the second row. It stops
    // it *after* the second debit has already left the member's account, which
    // is the half that matters.
    //
    // `SET NX` is the whole fix: the write IS the claim, and Redis decides. The
    // loser gets null and skips. Inngest memoises steps within a run, so the
    // realistic trigger was two overlapping runs — a manual trigger crossing
    // the cron, a redelivery — rather than two workers inside one.
    //
    // The database check stays, and stays second. Redis is a cache with a TTL:
    // if a key has expired or Upstash was replaced, the transaction row is the
    // durable record that this period was already collected. Asking Redis first
    // means the common case costs one round trip instead of a query.
    const claimedPeriod = await step.run(`claim-${mandate.id}`, async () => {
      const won = await redis.set(idempotencyKey, '1', { nx: true, ex: 60 * 60 * 72 })
      if (won === null) return false

      // We hold the claim. Now confirm no earlier run already collected this
      // period and let its key lapse — in which case the claim is released, so
      // a later legitimate attempt is not locked out by our own key.
      const already = await db.transaction.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      })
      if (already) {
        await redis.del(idempotencyKey).catch(() => {})
        return false
      }

      return true
    })

    if (!claimedPeriod) {
      tally.skipped += 1
      return
    }

    const contribution = await step.run(`upsert-contribution-${mandate.id}`, async () => {
      const existing = await db.contribution.findUnique({
        where: {
          userId_periodMonth_periodYear: {
            userId: mandate.userId,
            periodMonth,
            periodYear,
          },
        },
      })
      if (existing) return existing

      const dueDate = new Date(periodYear, periodMonth - 1, mandate.debitDay)
      return db.contribution.create({
        data: {
          userId: mandate.userId,
          periodMonth,
          periodYear,
          amountDue: mandate.amount,
          amountPaid: 0,
          dueDate,
          status: 'PENDING',
        },
      })
    })

    if (contribution.status === 'PAID') {
      tally.skipped += 1
      return
    }

    // Collect what is still outstanding, not the full mandate amount.
    //
    // Every figure below used to be `mandate.amount` — what the member agreed
    // to pay each month — regardless of what had already been paid against
    // this period. A partly-settled contribution was therefore charged in
    // full: pay R200 of R500 by hand, and the debit run still took R500,
    // over-collecting by the R200 already banked.
    //
    // That was unreachable while every payment came through the gateway,
    // because nothing could partly settle a period before debit day. Recording
    // cash and EFT payments makes it reachable — an admin banking R200 mid-
    // month is now an ordinary event, and it is exactly the case this would
    // have got wrong.
    //
    // `contribution.amountDue` rather than `mandate.amount` as the base: the
    // contribution is the obligation for this period and already carries the
    // amount that was due when it was raised, which is the figure the member's
    // statement shows. `subtractZAR` for the same reason the rest of the money
    // path uses it — see lib/money.
    const outstanding = subtractZAR(Number(contribution.amountDue), Number(contribution.amountPaid))

    // Fully covered without being marked PAID — a partial payment that exactly
    // closed the balance, or a status not yet recalculated. Either way there is
    // nothing to collect, and submitting a zero or negative debit would be
    // rejected by the gateway at best and charged at worst.
    if (outstanding <= 0) {
      tally.skipped += 1
      logger.info('Debit run: period already covered, nothing outstanding', {
        mandateId: mandate.id,
        userId: mandate.userId,
        period: periodKey,
      })
      return
    }

    // The step keeps Inngest's own retries, so a blip is retried in seconds.
    // Only an exhausted retry reaches this catch, and it means the submission
    // never landed — which has to be recorded, or the member is skipped for
    // the month with nothing anywhere to say so.
    let gatewayRes
    try {
      gatewayRes = await step.run(`submit-debit-${mandate.id}`, () =>
        paymentGateway.submitScheduledDebit({
          mandateId: mandate.netcashMandateId!,
          amount: debitAmountWithFee(outstanding),
          reference: `XXM-${yearStr}-${monthStr}`,
          idempotencyKey,
        }),
      )
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)

      // A FAILED row is what transaction-retry-failed looks for. Without it
      // there is nothing to recover from: no transaction, no trace, and the
      // mandate is not due again until next month.
      await step.run(`record-failed-${mandate.id}`, () =>
        db.transaction.create({
          data: {
            contributionId: contribution.id,
            mandateId: mandate.id,
            amount: outstanding,
            type: 'DEBIT_ORDER',
            status: 'FAILED',
            idempotencyKey,
            failureReason: `${INFRASTRUCTURE_FAILURE_PREFIX}${reason}`,
            gatewayResponse: { error: reason } as unknown as Prisma.InputJsonValue,
          },
        }),
      )

      notCollected.push({ mandateId: mandate.id, kind: 'infrastructure', reason })
      logger.error('Debit submission failed after retries — recorded for the retry job', {
        mandateId: mandate.id,
        userId: mandate.userId,
        period: periodKey,
        reason,
      })
      // Deliberately no member notification: nothing about their account went
      // wrong, and debit-declined would tell them otherwise.
      return
    }

    const txStatus = toTransactionStatus(gatewayRes.status)
    const failureReason =
      gatewayRes.status !== 'SUCCESS' ? (gatewayRes.reason ?? gatewayRes.status ?? null) : null

    if (txStatus === 'FAILED') {
      notCollected.push({
        mandateId: mandate.id,
        kind: 'declined',
        reason: failureReason ?? 'declined',
      })
    } else if (txStatus === 'SUCCESS') {
      tally.collected += 1
    } else {
      tally.awaitingSettlement += 1
    }

    const transaction = await step.run(`create-tx-${mandate.id}`, () =>
      db.transaction.create({
        data: {
          contributionId: contribution.id,
          mandateId: mandate.id,
          amount: outstanding,
          type: 'DEBIT_ORDER',
          status: txStatus,
          gatewayRef: gatewayRes.transactionRef ?? null,
          gatewayResponse: gatewayRes as unknown as Prisma.InputJsonValue,
          idempotencyKey,
          failureReason,
          processedAt: txStatus === 'SUCCESS' ? new Date() : null,
        },
      }),
    )

    if (txStatus === 'SUCCESS') {
      await step.run(`recalculate-${mandate.id}`, async () => {
        await recalculateContributionStatus(contribution.id)
        await Promise.all([
          cache.del(CACHE_KEYS.DASHBOARD_STATS),
          invalidateContributionSummaryCache(mandate.userId),
        ])
      })

      await step.run(`budget-check-${mandate.id}`, async () => {
        const budgetCheck = await checkBudget(mandate.userId, outstanding)
        if (budgetCheck.status === 'OVER_BUDGET') {
          await queueNotification({
            userId: mandate.userId,
            templateSlug: 'budget-auto-exceeded',
            channel: 'SMS',
            payload: {
              amount: outstanding.toString(),
              budget: budgetCheck.budget.toString(),
              type: 'monthly',
            },
          })
        }
      })
    }

    // Every placeholder any of these templates renders. An unsupplied one is
    // not dropped — `interpolate` sends it to the member as literal braces.
    // The URL is the page that can actually settle the debt rather than the
    // app root, because "log in to pay" that lands on a dashboard is an
    // instruction the member still has to go and interpret.
    const notifyPayload = {
      mandateId: mandate.id,
      firstName: mandate.user.firstName ?? '',
      amount: outstanding.toString(),
      period: periodKey,
      transactionId: transaction.id,
      url: `${env.NEXTAUTH_URL ?? ''}/dashboard/contribute`,
    }

    // A decline is not a pending debit, and the member has to be told the
    // difference: their money was not taken, and they can still pay by hand.
    //
    // `payment-failed-*` rather than the `debit-declined` pair that was also
    // seeded. Both were dead, but only these are in MANDATORY_SLUGS — the
    // others are filtered by notification preferences, so a member who had SMS
    // switched off would never have learned their debit failed. A declined
    // collection is not a message anyone should be able to opt out of.
    await step.run(`notify-${mandate.id}`, async () => {
      if (txStatus === 'FAILED') {
        // Both channels: this one costs the member money if it is missed.
        await queueNotification({
          userId: mandate.userId, templateSlug: 'payment-failed-sms',
          channel: 'SMS', payload: notifyPayload,
        })
        await queueNotification({
          userId: mandate.userId, templateSlug: 'payment-failed-email',
          channel: 'EMAIL', payload: notifyPayload,
        })
        return
      }

      await queueNotification({
        userId: mandate.userId,
        templateSlug: txStatus === 'SUCCESS' ? 'debit-success' : 'debit-pending',
        channel: 'SMS',
        payload: notifyPayload,
      })
    })
  }, (mandate) => mandate.id)

  // One sync after the whole run — the month's debits just moved the paid total.
  await step.run('sync-primary-goal', () => syncPrimaryGoalProgress())

  const declined = notCollected.filter((f) => f.kind === 'declined').length
  const infrastructure = notCollected.filter((f) => f.kind === 'infrastructure').length

  // Money that was due and did not arrive is the one outcome of this job that
  // a person has to see. The morning anomaly sweep would catch it a day later
  // off the same FAILED rows; this says it on the night.
  if (notCollected.length > 0 || outcome.failed > 0) {
    await step.run('alert-admins-uncollected', () => {
      const uncollected = notCollected.length + outcome.failed
      const lines = [
        `${declined} declined by the bank`,
        `${infrastructure} could not be submitted (gateway unreachable)`,
        `${outcome.failed} failed unexpectedly`,
      ].filter((line) => !line.startsWith('0 '))

      // Through the alert service rather than straight to the inbox. The
      // message was already being written; it was only ever being *filed*.
      // Infrastructure failures are the graver half — a decline is one member's
      // bank saying no, an unreachable gateway is every remaining member of the
      // run collecting nothing — but both mean money that was due did not
      // arrive, and on debit night that is worth an SMS.
      return raiseOperationalAlert({
        code: 'DEBIT_RUN_INCOMPLETE',
        severity: 'critical',
        // No emoji and no dash: this becomes an SMS, where either one halves
        // the characters per segment. The service adds its own marker for the
        // inbox, where that costs nothing.
        title: `${periodKey}: ${uncollected} contribution${uncollected === 1 ? '' : 's'} not collected`,
        body: [
          ...lines,
          '',
          'Declines and submission failures are retried daily for 7 days, up to 3 attempts.',
        ].join('\n'),
        entityId: periodKey,
        payload: { declined, infrastructure, unexpected: outcome.failed, detail: notCollected },
      })
    })
  }

  // Last, and unconditionally: a run that declined every mandate still ran, and
  // the heartbeat records that it ran, not that it went well. What went well is
  // the alert above's business.
  await step.run('heartbeat', () => recordJobHeartbeat('debit-run'))

  const summary = {
    period: periodKey,
    due: processableMandates.length,
    collected: tally.collected,
    awaitingSettlement: tally.awaitingSettlement,
    skipped: tally.skipped,
    declined,
    infrastructure,
    unexpected: outcome.failed,
  }

  logger.info('Debit run completed', summary)
  return summary
}

export const debitRun = inngest.createFunction(
  {
    id: 'debit-run',
    name: 'Monthly Debit Run',
    // The one job where failing quietly means no money moves at all.
    onFailure: alertOnFailure('The monthly debit run'),
  },
  { cron: '0 16 * * *' }, // 18:00 SAST (UTC+2)
  // Inngest's `step` carries far more than this job uses, and its `run` is
  // generic over the step tools rather than over a plain thunk, so the two
  // signatures do not unify structurally. Narrowing here is deliberate: the
  // run only ever calls `step.run(id, fn)`, and stating that as the contract is
  // what lets a test drive the whole job without an Inngest server.
  ({ step }) => executeDebitRun(step as unknown as DebitStepRunner),
)
