import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { logger } from '@xxm/observability'
import { recalculateContributionStatus } from '@/services/contribution.service'
import { reconcileLedger } from '@/services/ledger.service'
import { syncPrimaryGoalProgress } from '@/services/goal.service'
import { SUCCESSFUL_INFLOW_SQL } from '@/repositories/transaction.repository'
import { writeAuditLog } from '@/services/audit.service'

export const ledgerReconciliation = inngest.createFunction(
  { id: 'ledger-reconciliation', name: 'Nightly Ledger Reconciliation' },
  { cron: '0 3 * * *' }, // 05:00 SAST (UTC+2)
  async ({ step }) => {
    const drifted = await step.run('find-drift', async () => {
      // One grouped pass rather than an aggregate per contribution. The old
      // shape issued a round trip for every unsettled contribution — 2 400 of
      // them for a year of two hundred members — where a single grouped join
      // answers the same question. Measured on that volume: 58ms against 7.5ms
      // inside Postgres, and from here every one of those 2 400 was its own
      // trip to the database.
      //
      // Raw SQL because the comparison is between an aggregate and a column on
      // the grouped row, which Prisma's aggregation API cannot express. The
      // inflow rule comes from the same module as the Prisma filter rather than
      // being written out again here — a second definition of "what counts as
      // money in" is exactly the drift that #214 had to go and fix.
      const rows = await db.$queryRaw<Array<{ id: string; recorded: number; actual: number }>>`
        SELECT c.id,
               c."amountPaid"::float8                     AS recorded,
               COALESCE(SUM(t.amount), 0)::float8         AS actual
        FROM contributions c
        LEFT JOIN transactions t
          ON t."contributionId" = c.id
         AND ${Prisma.raw(SUCCESSFUL_INFLOW_SQL)}
        WHERE c.status IN ('PENDING', 'PARTIAL', 'OVERDUE')
        GROUP BY c.id, c."amountPaid"
        HAVING ABS(COALESCE(SUM(t.amount), 0) - c."amountPaid") > 0.01
      `

      return rows.map((r) => ({ id: r.id, recorded: Number(r.recorded), actual: Number(r.actual) }))
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

    // Backfill any missing immutable-ledger entries from settled transactions.
    const ledger = await step.run('reconcile-ledger', () => reconcileLedger())

    // Re-derive the primary fund's progress from the (now-reconciled) contributions.
    await step.run('sync-primary-goal', () => syncPrimaryGoalProgress())

    return {
      checked: drifted.length + corrected,
      drifted: drifted.length,
      corrected,
      ledger,
    }
  },
)
