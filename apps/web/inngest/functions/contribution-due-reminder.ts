import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'
import { logger } from '@/lib/logger'
import { queueNotification } from '@/services/notification.service'
import { selectDueSoonReminders } from '@/services/contribution.service'

// Nudge members a few days before a contribution falls due, encouraging an
// early, badge-boosting payment before the automatic debit.
const LEAD_DAYS = 3
// Throttle so each contribution is reminded once as it enters the window, never
// daily — covers the whole lead-up and a little past the due date.
const REMINDER_TTL_S = 7 * 24 * 60 * 60

export const contributionDueReminder = inngest.createFunction(
  { id: 'contribution-due-reminder', name: 'Early-Payment Reminder' },
  { cron: '0 8 * * *' }, // 10:00 SAST (UTC+2)
  async ({ step }) => {
    // Query + select inside the step so the Date/Decimal work happens before the
    // step boundary serialises its result; only plain, ready-to-send fields cross.
    const targets = await step.run('find-due-soon', async () => {
      const now = new Date()
      const horizon = new Date(now.getTime() + LEAD_DAYS * 24 * 60 * 60 * 1000)

      const candidates = await db.contribution.findMany({
        where: {
          status: { in: ['PENDING', 'PARTIAL'] },
          dueDate: { gte: now, lte: horizon },
        },
        include: { user: { select: { status: true } } },
      })

      return selectDueSoonReminders(candidates, now, LEAD_DAYS).map((c) => ({
        contributionId: c.id,
        userId: c.userId,
        amount: Number(c.amountDue).toString(),
        date: c.dueDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' }),
      }))
    })

    let reminded = 0
    for (const target of targets) {
      const throttleKey = `xxm:due-reminded:${target.contributionId}`
      const already = await step.run(`check-throttle-${target.contributionId}`, () => redis.get(throttleKey))
      if (already) continue

      await step.run(`notify-${target.contributionId}`, () =>
        queueNotification({
          userId: target.userId,
          templateSlug: 'contribution-due-reminder',
          channel: 'SMS',
          payload: {
            contributionId: target.contributionId,
            amount: target.amount,
            date: target.date,
          },
        }),
      )

      await step.run(`throttle-${target.contributionId}`, () => redis.set(throttleKey, '1', { ex: REMINDER_TTL_S }))
      reminded += 1
    }

    logger.info('Early-payment reminders sent', { dueSoon: targets.length, reminded })
    return { dueSoon: targets.length, reminded }
  },
)
