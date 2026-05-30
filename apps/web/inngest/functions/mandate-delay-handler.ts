import { Prisma } from '@prisma/client'
import type { TransactionStatus } from '@prisma/client'
import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { submitScheduledDebit } from '@/lib/netcash'
import { recalculateContributionStatus } from '@/services/contribution.service'
import { queueNotification } from '@/services/notification.service'

export const mandateDelayHandler = inngest.createFunction(
  { id: 'mandate-delay-handler', name: 'Mandate Delay Handler' },
  { event: 'xxm/mandate.delay-handler' },
  async ({ event, step }) => {
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
      db.paymentMandate.findUnique({ where: { id: mandateId } }),
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

    const gatewayRes = await step.run('submit-debit', () =>
      submitScheduledDebit({
        mandateId: mandate.netcashMandateId!,
        amount: Number(mandate.amount),
        reference: `XXM-${periodYear}-${String(periodMonth).padStart(2, '0')}-DELAY`,
        idempotencyKey,
      }),
    )

    const txStatus: TransactionStatus = gatewayRes.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING'
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

    await step.run('notify-result', () =>
      queueNotification({
        userId,
        templateSlug: txStatus === 'SUCCESS' ? 'debit-success' : 'debit-pending',
        channel: 'SMS',
        payload: {
          mandateId,
          amount: Number(mandate.amount).toString(),
          newDate,
        },
      }),
    )
  },
)
