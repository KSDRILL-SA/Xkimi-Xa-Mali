import { Prisma } from '@prisma/client'
import type { TransactionStatus } from '@prisma/client'
import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { todaySAST } from '@/lib/date'
import { redis } from '@/lib/redis'
import { submitScheduledDebit } from '@/lib/netcash'
import { recalculateContributionStatus } from '@/services/contribution.service'
import { queueNotification } from '@/services/notification.service'

export const debitRun = inngest.createFunction(
  { id: 'debit-run', name: 'Monthly Debit Run' },
  { cron: '0 18 * * *' }, // 20:00 SAST (UTC+2)
  async ({ step }) => {
    const today = await step.run('get-today', () => todaySAST())
    const parts = today.split('-')
    const dayOfMonth = parseInt(parts[2], 10)
    const periodYear = parseInt(parts[0], 10)
    const periodMonth = parseInt(parts[1], 10)
    const periodKey = `${parts[0]}-${parts[1]}`

    const mandates = await step.run('find-mandates', () =>
      db.paymentMandate.findMany({
        where: { status: 'ACTIVE', debitDay: dayOfMonth },
        include: { user: { select: { id: true, status: true } } },
      }),
    )

    for (const mandate of mandates) {
      if (mandate.user.status !== 'ACTIVE') continue
      if (!mandate.netcashMandateId) continue

      const delayed = await step.run(`check-delay-${mandate.id}`, () =>
        redis.get(`xxm:delay:${mandate.id}:${periodKey}`),
      )
      if (delayed) continue

      const idempotencyKey = `debit:run:${mandate.id}:${periodKey}`
      const alreadyRan = await step.run(`check-idempotency-${mandate.id}`, () =>
        redis.get(idempotencyKey),
      )
      if (alreadyRan) continue

      // Claim the slot before touching Netcash — prevents double-charge on retry
      await step.run(`claim-${mandate.id}`, () =>
        redis.set(idempotencyKey, '1', { ex: 60 * 60 * 48 }),
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

      if (contribution.status === 'PAID') continue

      const gatewayRes = await step.run(`submit-debit-${mandate.id}`, () =>
        submitScheduledDebit({
          mandateId: mandate.netcashMandateId!,
          amount: Number(mandate.amount),
          reference: `XXM-${parts[0]}-${parts[1]}`,
          idempotencyKey,
        }),
      )

      const txStatus: TransactionStatus = gatewayRes.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING'
      const failureReason =
        gatewayRes.status !== 'SUCCESS' ? (gatewayRes.reason ?? gatewayRes.status ?? null) : null

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
        await step.run(`recalculate-${mandate.id}`, () =>
          recalculateContributionStatus(contribution.id),
        )
      }

      await step.run(`notify-${mandate.id}`, () =>
        queueNotification({
          userId: mandate.userId,
          templateSlug: txStatus === 'SUCCESS' ? 'debit-success' : 'debit-pending',
          channel: 'SMS',
          payload: {
            mandateId: mandate.id,
            amount: Number(mandate.amount).toString(),
            period: periodKey,
            transactionId: transaction.id,
          },
        }),
      )
    }
  },
)
