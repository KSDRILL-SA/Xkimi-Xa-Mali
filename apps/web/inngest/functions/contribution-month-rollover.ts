import { inngest } from '@/lib/inngest'
import { todaySAST } from '@/lib/date'
import { generateMonthlyContributions } from '@/services/contribution.service'

export const contributionMonthRollover = inngest.createFunction(
  { id: 'contribution-month-rollover', name: 'Monthly Contribution Rollover' },
  { cron: '0 0 1 * *' }, // 02:00 SAST on the 1st of each month (UTC+2)
  async ({ step }) => {
    const today = await step.run('get-today', () => todaySAST())
    const [year, month] = today.split('-')
    if (!year || !month) {
      throw new Error(`contribution-month-rollover: unexpected date format from todaySAST(): ${today}`)
    }

    await step.run('generate', () =>
      generateMonthlyContributions(
        { month: parseInt(month, 10), year: parseInt(year, 10) },
        undefined,
        ['ADMIN'],
      ),
    )
  },
)
