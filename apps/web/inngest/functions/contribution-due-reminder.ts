import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { logger } from '@xxm/observability'
import { queueNotification } from '@/services/notification.service'
import { selectDueSoonReminders, findRemindedContributionIds } from '@/services/contribution.service'

// Nudge members a few days before a contribution falls due, encouraging an
// early, badge-boosting payment before the automatic debit.
const LEAD_DAYS = 3

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

    if (targets.length === 0) {
      logger.info('Early-payment reminders sent', { dueSoon: 0, reminded: 0 })
      return { dueSoon: 0, reminded: 0 }
    }

    // Which of these contributions has already had its reminder.
    //
    // This used to be a Redis key per contribution, and it failed open. The
    // cache client is a no-op shim when Upstash is not configured and its get()
    // always returns null, so every run read "not reminded yet" and sent again:
    // a member due in three days received the same SMS three days running, and
    // the group paid for three messages — in exactly the environments where
    // nobody had set Upstash up.
    //
    // The notification row is itself the record that a reminder was sent, so it
    // is the honest thing to throttle on. One query for the whole batch, and
    // correct whether or not a cache exists.
    const alreadyReminded = await step.run('find-already-reminded', () =>
      findRemindedContributionIds(targets.map((t) => t.contributionId)),
    )
    const remindedSet = new Set(alreadyReminded)

    let reminded = 0
    for (const target of targets) {
      if (remindedSet.has(target.contributionId)) continue

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
      reminded += 1
    }

    logger.info('Early-payment reminders sent', {
      dueSoon: targets.length,
      alreadyReminded: remindedSet.size,
      reminded,
    })
    return { dueSoon: targets.length, reminded }
  },
)
