import { inngest } from '@/lib/inngest'
import { sweepOverdueContributions } from '@/services/contribution.service'

export const contributionOverdueSweep = inngest.createFunction(
  { id: 'contribution-overdue-sweep', name: 'Overdue Contribution Sweep' },
  { cron: '30 22 * * *' },
  async ({ step }) => {
    const updated = await step.run('sweep', () => sweepOverdueContributions())
    return { updated }
  },
)
