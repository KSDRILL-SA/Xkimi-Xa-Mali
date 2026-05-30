import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { logger } from '@/lib/logger'
import { recalculateContributionStatus } from '@/services/contribution.service'
import { writeAuditLog } from '@/services/audit.service'

export const ledgerReconciliation = inngest.createFunction(
  { id: 'ledger-reconciliation', name: 'Nightly Ledger Reconciliation' },
  { cron: '0 3 * * *' },
  async ({ step }) => {
    const drifted = await step.run('find-drift', async () => {
      const contributions = await db.contribution.findMany({
        where: { status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] } },
        select: { id: true, amountPaid: true },
      })

      const results: Array<{ id: string; recorded: number; actual: number }> = []

      for (const c of contributions) {
        const aggr = await db.transaction.aggregate({
          where: { contributionId: c.id, status: 'SUCCESS' },
          _sum: { amount: true },
        })

        const actual = Number(aggr._sum.amount ?? 0)
        const recorded = Number(c.amountPaid)

        if (Math.abs(actual - recorded) > 0.01) {
          results.push({ id: c.id, recorded, actual })
        }
      }

      return results
    })

    let corrected = 0

    for (const item of drifted) {
      await step.run(`fix-${item.id}`, async () => {
        await recalculateContributionStatus(item.id)

        await writeAuditLog({
          action: 'LEDGER_DRIFT_CORRECTED',
          entity: 'Contribution',
          entityId: item.id,
          payload: {
            recordedAmount: item.recorded,
            actualAmount: item.actual,
            drift: item.actual - item.recorded,
            source: 'ledger-reconciliation',
          },
        })

        logger.warn('Ledger drift corrected', {
          contributionId: item.id,
          recorded: item.recorded,
          actual: item.actual,
        })

        corrected++
      })
    }

    return { checked: drifted.length + corrected, drifted: drifted.length, corrected }
  },
)
