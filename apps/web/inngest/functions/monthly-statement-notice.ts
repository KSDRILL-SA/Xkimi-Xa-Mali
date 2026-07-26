import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { logger } from '@xxm/observability'

export const monthlyStatementNotice = inngest.createFunction(
  { id: 'monthly-statement-notice', name: 'Monthly Statement Notice' },
  { cron: '0 4 3 * *' }, // 3rd of each month, 06:00 SAST — after month-end debits settle
  async ({ step }) => {
    const now = new Date()
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const label = prev.toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })

    return await step.run('notify-members', async () => {
      const members = await db.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })
      if (members.length === 0) return { notified: 0, period: label }

      await db.inboxMessage.createMany({
        data: members.map((m) => ({
          userId: m.id,
          title: `Your ${label} statement is ready`,
          body: `Your contribution statement for ${label} is ready to download from the Statements page.`,
          category: 'SYSTEM',
        })),
      })

      logger.info('Monthly statement notices sent', { period: label, notified: members.length })
      return { notified: members.length, period: label }
    })
  },
)
