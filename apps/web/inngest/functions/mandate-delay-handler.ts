import { Prisma } from '@prisma/client'
import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { logger } from '@xxm/observability'
import { paymentGateway } from '@/integrations/payment'
import { debitAmountWithFee } from '@/lib/group-account'
import { recalculateContributionStatus } from '@/services/contribution.service'
import { queueNotification } from '@/services/notification.service'
import { toTransactionStatus } from '@/lib/transaction-status'
import { INFRASTRUCTURE_FAILURE_PREFIX } from '@xxm/utils'
import { collectionReference } from '@xxm/utils/collection-reference'

/**
 * Inngest's `step`, narrowed to what this job uses.
 *
 * This is the debit a member explicitly asked to move. Getting it wrong is not
 * a missed collection like the others — it is charging someone on a day they
 * said they could not afford, or never charging them at all after they asked
 * for a date and were told it was set.
 */
export type DelayStepRunner = {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>
  sleepUntil(id: string, at: Date): Promise<unknown>
}

export async function executeMandateDelay(
  step: DelayStepRunner,
  event: { data: { mandateId: string; userId: string; newDate: string } },
) {
  const { mandateId, userId, newDate } = event.data

  // Sleep until 09:00 SAST (07:00 UTC) the day before the delayed debit
  const debitDate = new Date(`${newDate}T00:00:00Z`)
  const warningAt = new Date(debitDate)
  warningAt.setUTCDate(warningAt.getUTCDate() - 1)
  warningAt.setUTCHours(7, 0, 0, 0)

  await step.sleepUntil('wait-for-warning-day', warningAt)

  await step.run('notify-day-before', () =>
    queueNotification({
      userId,
      templateSlug: 'debit-tomorrow-warning',
      channel: 'SMS',
      payload: { mandateId, newDate },
    }),
  )

  // Sleep until 20:00 SAST (18:00 UTC) on the delayed debit date
  const debitAt = new Date(`${newDate}T18:00:00Z`)
  await step.sleepUntil('wait-for-debit-time', debitAt)

  const mandate = await step.run('fetch-mandate', () =>
    db.paymentMandate.findUnique({
      where: { id: mandateId },
      // firstName so a decline can address them by name, as the successful
      // messages already do.
      include: { user: { select: { firstName: true } } },
    }),
  )

  // Mandate could have been cancelled in the interim — abort silently
  if (!mandate || mandate.status !== 'ACTIVE' || !mandate.netcashMandateId) return

  const periodYear = debitDate.getUTCFullYear()
  const periodMonth = debitDate.getUTCMonth() + 1
  const periodKey = `${periodYear}-${String(periodMonth).padStart(2, '0')}`
  const idempotencyKey = `debit:delay:${mandateId}:${periodKey}`

  const contribution = await step.run('upsert-contribution', async () => {
    const existing = await db.contribution.findUnique({
      where: {
        userId_periodMonth_periodYear: { userId, periodMonth, periodYear },
      },
    })
    if (existing) return existing

    const dueDate = new Date(periodYear, periodMonth - 1, debitDate.getUTCDate())
    return db.contribution.create({
      data: {
        userId,
        periodMonth,
        periodYear,
        amountDue: mandate.amount,
        amountPaid: 0,
        dueDate,
        status: 'PENDING',
      },
    })
  })

  if (contribution.status === 'PAID') return

  // As in the debit run: the step keeps Inngest's own retries, and only an
  // exhausted retry reaches this catch. A submission that never landed has to
  // leave a FAILED row, or the member asked for a date, was told it was set,
  // and nothing happened on it — with no trace anywhere.
  let gatewayRes
  try {
    gatewayRes = await step.run('submit-debit', () =>
      paymentGateway.submitScheduledDebit({
        mandateId: mandate.netcashMandateId!,
        amount: debitAmountWithFee(Number(mandate.amount)),
        // Same reference as any other collection from this member. A delay is
        // when we collect, not a different agreement — a distinct reference here
        // would read to the provider as a second contract.
        reference: collectionReference(userId),
        idempotencyKey,
      }),
    )
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)

    // UNKNOWN, not FAILED — the same distinction as the debit run's, and the
    // same reason. An exhausted retry here is a timeout or an unreachable
    // gateway, not a decline: the submission may have landed and the money may
    // already be gone. Recording it as FAILED put it in
    // `transaction-retry-failed`'s query and had it submitted again.
    await step.run('record-unknown', () =>
      db.transaction.create({
        data: {
          contributionId: contribution.id,
          mandateId: mandate.id,
          amount: Number(mandate.amount),
          type: 'DEBIT_ORDER',
          status: 'UNKNOWN',
          idempotencyKey,
          failureReason: `${INFRASTRUCTURE_FAILURE_PREFIX}${reason}`,
          gatewayResponse: { error: reason } as unknown as Prisma.InputJsonValue,
        },
      }),
    )

    logger.error('Delayed debit outcome unknown — recorded, and NOT queued for retry', {
      mandateId, userId, date: newDate, reason,
    })
    // No member message: nothing about their account went wrong.
    return { outcome: 'infrastructure' as const }
  }

  // A decline written as PENDING is invisible to transaction-retry-failed and
  // tells the member their debit is processing. This is the third copy of
  // that mistake; the mapping is shared now so there is not a fourth.
  const txStatus = toTransactionStatus(gatewayRes.status)
  const failureReason =
    gatewayRes.status !== 'SUCCESS' ? (gatewayRes.reason ?? gatewayRes.status ?? null) : null

  await step.run('create-tx', () =>
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
    await step.run('recalculate', () => recalculateContributionStatus(contribution.id))
  }

  const payload = {
    mandateId,
    firstName: mandate.user?.firstName ?? '',
    amount: Number(mandate.amount).toString(),
    period: periodKey,
    newDate,
    url: `${env.NEXTAUTH_URL ?? ''}/dashboard/contribute`,
  }

  await step.run('notify-result', async () => {
    if (txStatus === 'FAILED') {
      // Both channels, and the mandatory templates — a member who moved their
      // debit and then had it declined is the last person who should have to
      // find out by checking.
      await queueNotification({ userId, templateSlug: 'payment-failed-sms', channel: 'SMS', payload })
      await queueNotification({ userId, templateSlug: 'payment-failed-email', channel: 'EMAIL', payload })
      return
    }

    await queueNotification({
      userId,
      templateSlug: txStatus === 'SUCCESS' ? 'debit-success' : 'debit-pending',
      channel: 'SMS',
      payload,
    })
  })

  return { outcome: txStatus }
}

export const mandateDelayHandler = inngest.createFunction(
  { id: 'mandate-delay-handler', name: 'Mandate Delay Handler' },
  { event: 'xxm/mandate.delay-handler' },
  ({ event, step }) => executeMandateDelay(
    step as unknown as DelayStepRunner,
    event as unknown as Parameters<typeof executeMandateDelay>[1],
  ),
)
