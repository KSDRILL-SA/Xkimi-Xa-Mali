import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { todaySAST } from '@/lib/date'
import { redis } from '@/lib/redis'
import { logger } from '@xxm/observability'
import { queueNotification } from '@/services/notification.service'
import { planDebitWarnings } from '@/services/mandate.service'

const RISK_LOOKBACK_MS = 90 * 24 * 60 * 60 * 1000 // recent failure window

export const debitMorningWarning = inngest.createFunction(
  { id: 'debit-morning-warning', name: 'Debit Morning Warning' },
  { cron: '0 6 * * *' }, // 08:00 SAST (UTC+2)
  async ({ step }) => {
    const today = await step.run('get-today', () => todaySAST())
    const [year, month, dayStr] = today.split('-')
    if (!year || !month || !dayStr) {
      throw new Error(`debit-morning-warning: unexpected date format from todaySAST(): ${today}`)
    }
    const dayOfMonth = parseInt(dayStr, 10)
    const periodYear = parseInt(year, 10)
    const periodMonth = parseInt(month, 10)
    const periodKey = `${year}-${month}`

    const mandates = await step.run('find-mandates', () =>
      db.paymentMandate.findMany({
        where: { status: 'ACTIVE', debitDay: dayOfMonth },
        include: { user: { select: { id: true, status: true } } },
      }),
    )

    if (mandates.length === 0) return { total: 0, warned: 0, atRisk: 0 }

    const userIds = mandates.map((m) => m.userId)

    // Who is already settled for this period (debit won't run) and who has failed
    // recently (needs the reminder most) — fetched once, in parallel.
    const context = await step.run('fetch-context', async () => {
      const [settledRows, failureRows] = await Promise.all([
        db.contribution.findMany({
          where: { userId: { in: userIds }, periodMonth, periodYear, status: { in: ['PAID', 'WAIVED'] } },
          select: { userId: true },
        }),
        db.transaction.findMany({
          where: {
            status: 'FAILED',
            createdAt: { gte: new Date(Date.now() - RISK_LOOKBACK_MS) },
            contribution: { userId: { in: userIds } },
          },
          select: { contribution: { select: { userId: true } } },
        }),
      ])
      return {
        settled: settledRows.map((r) => r.userId),
        atRisk: failureRows.map((r) => r.contribution?.userId).filter((id): id is string => !!id),
      }
    })

    const targets = planDebitWarnings(
      mandates.map((m) => ({ id: m.id, userId: m.userId, amount: Number(m.amount), userStatus: m.user.status })),
      new Set(context.settled),
      new Set(context.atRisk),
    )

    let warned = 0
    for (const target of targets) {
      const delayed = await step.run(`check-delay-${target.mandateId}`, () =>
        redis.get(`xxm:delay:${target.mandateId}:${periodKey}`),
      )
      if (delayed) continue

      await step.run(`notify-${target.mandateId}`, () =>
        queueNotification({
          userId: target.userId,
          // At-risk members (a recent debit failed) get the stronger reminder.
          templateSlug: target.atRisk ? 'debit-morning-warning-urgent' : 'debit-morning-warning',
          channel: 'SMS',
          payload: {
            mandateId: target.mandateId,
            date: today,
            amount: target.amount.toString(),
            atRisk: target.atRisk,
          },
        }),
      )
      warned += 1
    }

    const atRiskCount = targets.filter((t) => t.atRisk).length
    logger.info('Debit morning warning sent', {
      dueToday: mandates.length,
      settledSkipped: mandates.length - targets.length,
      warned,
      atRisk: atRiskCount,
    })

    return { total: mandates.length, warned, atRisk: atRiskCount }
  },
)
