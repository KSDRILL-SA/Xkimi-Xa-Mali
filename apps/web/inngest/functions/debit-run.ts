import { Prisma } from '@prisma/client'
import type { TransactionStatus } from '@prisma/client'
import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { todaySAST } from '@/lib/date'
import { redis } from '@/lib/redis'
import { paymentGateway } from '@/integrations/payment'
import { debitAmountWithFee } from '@/lib/group-account'
import { recalculateContributionStatus, invalidateContributionSummaryCache } from '@/services/contribution.service'
import { syncPrimaryGoalProgress } from '@/services/goal.service'
import { checkBudget } from '@/services/budget.service'
import { queueNotification } from '@/services/notification.service'
import { notifyAdmins } from '@/services/inbox.service'
import { writeAuditLog } from '@/services/audit.service'
import { cache, CACHE_KEYS } from '@/lib/cache'
import { env } from '@/lib/env'
import { logger } from '@xxm/observability'
import { INFRASTRUCTURE_FAILURE_PREFIX } from '@xxm/utils'
import { toTransactionStatus } from '@/lib/transaction-status'

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
    const alreadyRan = await step.run(`check-idempotency-${mandate.id}`, async () => {
      const redisCheck = await redis.get(idempotencyKey)
      if (redisCheck) return true
      const dbCheck = await db.transaction.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      })
      return !!dbCheck
    })
    if (alreadyRan) {
      tally.skipped += 1
      return
    }

    await step.run(`claim-${mandate.id}`, () =>
      redis.set(idempotencyKey, '1', { ex: 60 * 60 * 72 }),
    )

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

    // The step keeps Inngest's own retries, so a blip is retried in seconds.
    // Only an exhausted retry reaches this catch, and it means the submission
    // never landed — which has to be recorded, or the member is skipped for
    // the month with nothing anywhere to say so.
    let gatewayRes
    try {
      gatewayRes = await step.run(`submit-debit-${mandate.id}`, () =>
        paymentGateway.submitScheduledDebit({
          mandateId: mandate.netcashMandateId!,
          amount: debitAmountWithFee(Number(mandate.amount)),
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
            amount: Number(mandate.amount),
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
          amount: Number(mandate.amount),
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
        const budgetCheck = await checkBudget(mandate.userId, Number(mandate.amount))
        if (budgetCheck.status === 'OVER_BUDGET') {
          await queueNotification({
            userId: mandate.userId,
            templateSlug: 'budget-auto-exceeded',
            channel: 'SMS',
            payload: {
              amount: Number(mandate.amount).toString(),
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
      amount: Number(mandate.amount).toString(),
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
    await step.run('alert-admins-uncollected', async () => {
      const lines = [
        `${declined} declined by the bank`,
        `${infrastructure} could not be submitted (gateway unreachable)`,
        `${outcome.failed} failed unexpectedly`,
      ].filter((line) => !line.startsWith('0 '))

      await notifyAdmins({
        title: `⚠️ ${periodKey}: ${notCollected.length + outcome.failed} contribution${notCollected.length + outcome.failed === 1 ? '' : 's'} not collected`,
        body: [
          ...lines,
          '',
          'Declines and submission failures are retried daily for 7 days, up to 3 attempts.',
        ].join('\n'),
      })

      await writeAuditLog({
        action: 'DEBIT_RUN_INCOMPLETE',
        entity: 'System',
        entityId: periodKey,
        payload: { declined, infrastructure, unexpected: outcome.failed, detail: notCollected },
      })
    })
  }

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
  { id: 'debit-run', name: 'Monthly Debit Run' },
  { cron: '0 16 * * *' }, // 18:00 SAST (UTC+2)
  // Inngest's `step` carries far more than this job uses, and its `run` is
  // generic over the step tools rather than over a plain thunk, so the two
  // signatures do not unify structurally. Narrowing here is deliberate: the
  // run only ever calls `step.run(id, fn)`, and stating that as the contract is
  // what lets a test drive the whole job without an Inngest server.
  ({ step }) => executeDebitRun(step as unknown as DebitStepRunner),
)
