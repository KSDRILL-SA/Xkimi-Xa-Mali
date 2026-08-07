import { inngest } from '@/lib/inngest'
import { recalculateAll, recalculateOne } from '@/services/badge.service'

export const badgeRecalculation = inngest.createFunction(
  { id: 'badge-recalculation', name: 'Badge Recalculation' },
  [
    { cron: '0 2 1 * *' }, // 04:00 SAST (UTC+2), 1st of each month — after the contribution rollover
    { event: 'xxm/contribution.status.changed' },
  ],
  async ({ event, step }) => {
    if (event?.name === 'xxm/contribution.status.changed') {
      const { userId, status } = event.data

      if (status !== 'PAID' && status !== 'OVERDUE') {
        return { skipped: true }
      }

      const trigger = status === 'PAID' ? 'contribution_paid' : 'contribution_overdue'
      await step.run('recalculate-one', () => recalculateOne(userId, trigger))
      return { recalculated: 1 }
    }

    const processed = await step.run('recalculate-all', () => recalculateAll('monthly_recalc'))
    return { recalculated: processed }
  },
)
