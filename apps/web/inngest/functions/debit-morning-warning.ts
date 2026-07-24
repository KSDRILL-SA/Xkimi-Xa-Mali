import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { todaySAST } from '@/lib/date'
import { redis } from '@/lib/redis'
import { queueNotification } from '@/services/notification.service'

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
    const periodKey = `${year}-${month}`

    const mandates = await step.run('find-mandates', () =>
      db.paymentMandate.findMany({
        where: { status: 'ACTIVE', debitDay: dayOfMonth },
        include: { user: { select: { id: true, status: true } } },
      }),
    )

    for (const mandate of mandates) {
      if (mandate.user.status !== 'ACTIVE') continue

      const delayed = await step.run(`check-delay-${mandate.id}`, () =>
        redis.get(`xxm:delay:${mandate.id}:${periodKey}`),
      )
      if (delayed) continue

      await step.run(`notify-${mandate.id}`, () =>
        queueNotification({
          userId: mandate.userId,
          templateSlug: 'debit-morning-warning',
          channel: 'SMS',
          payload: {
            mandateId: mandate.id,
            date: today,
            amount: Number(mandate.amount).toString(),
          },
        }),
      )
    }
  },
)
