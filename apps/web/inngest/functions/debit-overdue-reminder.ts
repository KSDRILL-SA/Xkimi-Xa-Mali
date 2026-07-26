import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { queueNotification } from '@/services/notification.service'
import { findNotifiedContributionIds } from '@/services/contribution.service'

export const debitOverdueReminder = inngest.createFunction(
  { id: 'debit-overdue-reminder', name: 'Overdue Contribution Reminder' },
  { cron: '0 7 * * *' }, // 09:00 SAST (UTC+2)
  async ({ step }) => {
    const overdue = await step.run('find-overdue', () =>
      db.contribution.findMany({
        where: { status: 'OVERDUE' },
        include: { user: { select: { status: true } } },
      }),
    )

    const active = overdue.filter((c) => c.user.status === 'ACTIVE')

    // Who has already heard from us today.
    //
    // This was a Redis key with a one-day expiry, and the cache is a no-op shim
    // when Upstash is not configured — its get() always returns null, so every
    // run read "not reminded yet". A contribution stays overdue until it is
    // paid, so a member already behind on money was being sent the same SMS
    // every single day, indefinitely, and the group was paying for each one.
    //
    // The notification row carries the same information durably. One query for
    // the whole batch, and correct whether or not a cache exists.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const remindedToday = new Set(
      await step.run('find-reminded-today', () =>
        findNotifiedContributionIds('overdue-reminder', active.map((c) => c.id), since),
      ),
    )

    for (const contribution of active) {
      if (remindedToday.has(contribution.id)) continue

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
    }
  },
)
