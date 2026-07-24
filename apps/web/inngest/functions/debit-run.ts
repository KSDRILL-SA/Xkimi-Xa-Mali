import { Prisma } from '@prisma/client'
import type { TransactionStatus } from '@prisma/client'
import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { todaySAST } from '@/lib/date'
import { redis } from '@/lib/redis'
import { paymentGateway } from '@/integrations/payment'
import { debitAmountWithFee } from '@/lib/group-account'
import { recalculateContributionStatus, invalidateContributionSummaryCache } from '@/services/contribution.service'
import { checkBudget } from '@/services/budget.service'
import { queueNotification } from '@/services/notification.service'
import { cache, CACHE_KEYS } from '@/lib/cache'

export const debitRun = inngest.createFunction(
  { id: 'debit-run', name: 'Monthly Debit Run' },
  { cron: '0 16 * * *' }, // 18:00 SAST (UTC+2)
  async ({ step }) => {
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
      const alreadyRan = await step.run(`check-idempotency-${mandate.id}`, async () => {
        const redisCheck = await redis.get(idempotencyKey)
        if (redisCheck) return true
        const dbCheck = await db.transaction.findUnique({
          where: { idempotencyKey },
          select: { id: true },
        })
        return !!dbCheck
      })
      if (alreadyRan) continue

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

      if (contribution.status === 'PAID') continue

      const gatewayRes = await step.run(`submit-debit-${mandate.id}`, () =>
        paymentGateway.submitScheduledDebit({
          mandateId: mandate.netcashMandateId!,
          amount: debitAmountWithFee(Number(mandate.amount)),
          reference: `XXM-${yearStr}-${monthStr}`,
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
