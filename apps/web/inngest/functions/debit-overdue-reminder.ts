import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'
import { queueNotification } from '@/services/notification.service'

export const debitOverdueReminder = inngest.createFunction(
  { id: 'debit-overdue-reminder', name: 'Overdue Contribution Reminder' },
  { cron: '0 6 * * *' }, // 08:00 SAST (UTC+2)
  async ({ step }) => {
    const overdue = await step.run('find-overdue', () =>
      db.contribution.findMany({
        where: { status: 'OVERDUE' },
        include: { user: { select: { status: true } } },
      }),
    )

    for (const contribution of overdue) {
      if (contribution.user.status !== 'ACTIVE') continue

      const throttleKey = `xxm:overdue:reminded:${contribution.id}`
      const reminded = await step.run(`check-throttle-${contribution.id}`, () =>
        redis.get(throttleKey),
      )
      if (reminded) continue

      await step.run(`notify-${contribution.id}`, () =>
        queueNotification({
          userId: contribution.userId,
          templateSlug: 'overdue-reminder',
          channel: 'SMS',
          payload: {
            contributionId: contribution.id,
            periodMonth: contribution.periodMonth,
            periodYear: contribution.periodYear,
            amountDue: Number(contribution.amountDue).toString(),
          },
        }),
      )

      await step.run(`throttle-${contribution.id}`, () =>
        redis.set(throttleKey, '1', { ex: 60 * 60 * 24 }),
      )
    }
  },
)
