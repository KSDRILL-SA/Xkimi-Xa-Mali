import { inngest } from '@/lib/inngest'
import { db } from '@/lib/db'
import { Prisma } from '@prisma/client'
import { logger } from '@xxm/observability'
import { recalculateContributionStatus } from '@/services/contribution.service'
import { reconcileLedger } from '@/services/ledger.service'
import { syncPrimaryGoalProgress } from '@/services/goal.service'
import { SUCCESSFUL_INFLOW_SQL } from '@/repositories/transaction.repository'
import { writeAuditLog } from '@/services/audit.service'
import { raiseOperationalAlert } from '@/services/alert.service'
import { alertOnFailure } from '@/inngest/on-failure'

/**
 * Inngest's `step`, narrowed to what this job uses.
 *
 * Declared so a stub can drive the job — including a stub that memoises, which
 * is the behaviour that matters here. A completed step is not re-executed on a
 * later invocation; it returns its recorded value. Anything counted inside one
 * is therefore counted at most once, no matter how many times the function is
 * re-entered.
 */
export type ReconciliationStepRunner = {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>
}

export async function executeLedgerReconciliation(step: ReconciliationStepRunner) {
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
    })

    // Counted out here, not inside the step. A completed step is not
    // re-executed when the function is re-entered — it returns its recorded
    // value — so a counter incremented inside one stops climbing after the
    // first pass. This job corrected every drift it found and then reported
    // having corrected none of them.
    corrected++
  }

  // Backfill any missing immutable-ledger entries from settled transactions.
  const ledger = await step.run('reconcile-ledger', () => reconcileLedger())

  // Re-derive the primary fund's progress from the (now-reconciled) contributions.
  await step.run('sync-primary-goal', () => syncPrimaryGoalProgress())

  // Drift is not a routine correction, and a job that fixes it quietly is
  // indistinguishable from a job with nothing to fix. What a contribution
  // records and what its transactions add up to disagreed; something wrote one
  // and not the other. Self-healing every night is the signature of a
  // systematic bug, and until now the only trace was a log line and an audit
  // row that nobody reads on purpose.
  //
  // Raised after the corrections rather than before, so the message can say
  // both what was found and that it was dealt with.
  if (drifted.length > 0) {
    await step.run('alert-ledger-drift', () => {
      const netDrift = drifted.reduce((sum, item) => sum + (item.actual - item.recorded), 0)

      return raiseOperationalAlert({
        code: 'LEDGER_DRIFT_DETECTED',
        // Records disagreeing about money is the definition of the thing this
        // system exists to get right. It goes out on every channel.
        severity: 'critical',
        title: `Ledger drift on ${drifted.length} contribution${drifted.length === 1 ? '' : 's'}`,
        body: [
          `${drifted.length} contribution${drifted.length === 1 ? '' : 's'} recorded a paid amount that its transactions do not add up to.`,
          `Net difference: R${netDrift.toFixed(2)} (positive means more was received than recorded).`,
          `${corrected} ${corrected === 1 ? 'was' : 'were'} recalculated from the transactions, which are the source of truth.`,
          '',
          'The correction is already applied. What needs a person is why it drifted:',
          'a recurring count here means something is writing one side and not the other.',
        ].join('\n'),
        entityId: new Date().toISOString().slice(0, 10),
        payload: { drifted: drifted.length, corrected, netDrift, detail: drifted },
      })
    })
  }

  // No "checked" count: the query's HAVING clause returns only rows that have
  // already drifted, so the number examined is never known here. Adding
  // `corrected` to `drifted` counted the same contributions twice and named
  // the total after something this job cannot measure.
  return {
    drifted: drifted.length,
    corrected,
    ledger,
  }
}

export const ledgerReconciliation = inngest.createFunction(
  {
    id: 'ledger-reconciliation',
    name: 'Nightly Ledger Reconciliation',
    // If this stops running, drift accumulates unseen — and the job that would
    // have told anyone about drift is this one.
    onFailure: alertOnFailure('Nightly ledger reconciliation'),
  },
  { cron: '0 3 * * *' }, // 05:00 SAST (UTC+2)
  ({ step }) => executeLedgerReconciliation(step as unknown as ReconciliationStepRunner),
)
