import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * The nightly reconciliation, end to end, through a stub step runner.
 *
 * This job is what notices the ledger and the contributions disagreeing. It is
 * the last of the three money-touching jobs to get a seam.
 */

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  recalculate: vi.fn(),
  writeAuditLog: vi.fn(),
  reconcileLedger: vi.fn(),
  syncPrimaryGoal: vi.fn(),
  raiseAlert: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: {} }))
vi.mock('@/lib/inngest', () => ({ inngest: { createFunction: () => ({}) } }))
vi.mock('@/lib/db', () => ({ db: { $queryRaw: mocks.queryRaw } }))
vi.mock('@prisma/client', () => ({ Prisma: { raw: (s: string) => s } }))
vi.mock('@/services/contribution.service', () => ({ recalculateContributionStatus: mocks.recalculate }))
vi.mock('@/services/ledger.service', () => ({ reconcileLedger: mocks.reconcileLedger }))
vi.mock('@/services/goal.service', () => ({ syncPrimaryGoalProgress: mocks.syncPrimaryGoal }))
vi.mock('@/repositories/transaction.repository', () => ({ SUCCESSFUL_INFLOW_SQL: "t.status = 'SUCCESS'" }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/services/alert.service', () => ({ raiseOperationalAlert: mocks.raiseAlert }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: mocks.warn, error: vi.fn(), debug: vi.fn() },
}))

import { executeLedgerReconciliation } from '@/inngest/functions/ledger-reconciliation'

/** Runs every step. The first invocation of a run. */
const freshStep = { run: async <T>(_id: string, fn: () => Promise<T> | T): Promise<T> => fn() }

/**
 * A step runner that has already completed some steps.
 *
 * This is how Inngest actually re-enters a function: a step that finished on an
 * earlier request is *not* executed again — its recorded value is returned. The
 * function body still runs from the top around it.
 */
function memoisedStep(done: Map<string, unknown>) {
  return {
    run: async <T>(id: string, fn: () => Promise<T> | T): Promise<T> => {
      if (done.has(id)) return done.get(id) as T
      const value = await fn()
      done.set(id, value)
      return value
    },
  }
}

const drift = (id: string) => ({ id, recorded: 100, actual: 250 })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.queryRaw.mockResolvedValue([])
  mocks.recalculate.mockResolvedValue(undefined)
  mocks.writeAuditLog.mockResolvedValue(undefined)
  mocks.reconcileLedger.mockResolvedValue({ created: 0 })
  mocks.syncPrimaryGoal.mockResolvedValue(undefined)
  mocks.raiseAlert.mockResolvedValue(undefined)
})

describe('executeLedgerReconciliation — correcting drift', () => {
  it('recalculates every contribution whose ledger disagrees with it', async () => {
    mocks.queryRaw.mockResolvedValue([drift('c1'), drift('c2')])

    const summary = await executeLedgerReconciliation(freshStep)

    expect(mocks.recalculate).toHaveBeenCalledTimes(2)
    expect(summary).toMatchObject({ drifted: 2, corrected: 2 })
  })

  it('records the size and direction of the drift it corrected', async () => {
    mocks.queryRaw.mockResolvedValue([{ id: 'c1', recorded: 100, actual: 250 }])

    await executeLedgerReconciliation(freshStep)

    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'LEDGER_DRIFT_CORRECTED',
        entityId: 'c1',
        payload: expect.objectContaining({ recordedAmount: 100, actualAmount: 250, drift: 150 }),
      }),
    )
  })

  /**
   * Drift used to be corrected in silence — a log line and an audit row, and
   * nothing that reaches a person. A contribution and its transactions
   * disagreeing about money is not a routine correction, and a count that keeps
   * coming back is the signature of something writing one side and not the
   * other. Nobody would ever have seen it.
   */
  it('tells someone, rather than correcting it quietly', async () => {
    mocks.queryRaw.mockResolvedValue([
      { id: 'c1', recorded: 100, actual: 250 },
      { id: 'c2', recorded: 80, actual: 30 },
    ])

    await executeLedgerReconciliation(freshStep)

    expect(mocks.raiseAlert).toHaveBeenCalledOnce()
    const alert = mocks.raiseAlert.mock.calls[0][0]
    expect(alert).toMatchObject({ code: 'LEDGER_DRIFT_DETECTED', severity: 'critical' })
    expect(alert.title).toContain('2 contributions')
    // +150 and -50 net to +100. The direction matters: more money arriving than
    // was recorded is a different problem from less.
    expect(alert.payload).toMatchObject({ drifted: 2, corrected: 2, netDrift: 100 })
  })

  /**
   * Real bug, found while auditing this job for §14.g (production-readiness
   * tracker, "correct decimal/monetary representation"): `drift` and
   * `netDrift` were raw `a - b` / reduce-`+` on rand amounts, bypassing this
   * codebase's own documented rule (apps/web/lib/money.ts) that chained JS
   * arithmetic on money must go through `subtractZAR`/`sumZAR` to avoid
   * accumulating binary-float dust. `10.20 - 10.10` in raw JS is
   * `0.09999999999999964`, not `0.1` — exactly the shape of value this alert
   * writes into an audit log and a critical SMS.
   */
  it('reports drift and net drift as clean rand values, not raw float dust', async () => {
    mocks.queryRaw.mockResolvedValue([
      { id: 'c1', recorded: 10.10, actual: 10.20 },
      { id: 'c2', recorded: 5.10, actual: 5.20 },
    ])

    await executeLedgerReconciliation(freshStep)

    expect(mocks.writeAuditLog).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ payload: expect.objectContaining({ drift: 0.1 }) }),
    )
    const alert = mocks.raiseAlert.mock.calls[0][0]
    expect(alert.payload.netDrift).toBe(0.2)
    expect(alert.body).toContain('R0.20')
  })

  it('does nothing but the backfill when the books agree', async () => {
    const summary = await executeLedgerReconciliation(freshStep)

    expect(mocks.recalculate).not.toHaveBeenCalled()
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
    expect(mocks.raiseAlert).not.toHaveBeenCalled()
    expect(summary).toMatchObject({ drifted: 0, corrected: 0 })
    // The backfill and the goal sync are unconditional — a run with no drift
    // still has settled transactions that may have no ledger entry.
    expect(mocks.reconcileLedger).toHaveBeenCalledOnce()
    expect(mocks.syncPrimaryGoal).toHaveBeenCalledOnce()
  })
})

describe('executeLedgerReconciliation — when the function is re-entered', () => {
  it('still reports what it corrected after the steps are memoised', async () => {
    // The count used to be incremented inside step.run. A completed step is not
    // executed again, so on the pass that actually returns — when every fix is
    // already recorded — the job reported having corrected nothing, having
    // corrected everything.
    mocks.queryRaw.mockResolvedValue([drift('c1'), drift('c2'), drift('c3')])

    const done = new Map<string, unknown>()
    await executeLedgerReconciliation(memoisedStep(done))   // first pass
    const summary = await executeLedgerReconciliation(memoisedStep(done)) // re-entry

    expect(summary).toMatchObject({ drifted: 3, corrected: 3 })
  })

  it('does not correct the same contribution twice across re-entries', async () => {
    mocks.queryRaw.mockResolvedValue([drift('c1')])

    const done = new Map<string, unknown>()
    await executeLedgerReconciliation(memoisedStep(done))
    await executeLedgerReconciliation(memoisedStep(done))

    // The recalculation and the audit entry belong to the step, so memoisation
    // is exactly what must stop them running twice.
    expect(mocks.recalculate).toHaveBeenCalledTimes(1)
    expect(mocks.writeAuditLog).toHaveBeenCalledTimes(1)
    // The alert lives in a step too, for the same reason: a re-entered run must
    // not send a second SMS about drift it already reported.
    expect(mocks.raiseAlert).toHaveBeenCalledTimes(1)
  })
})

describe('executeLedgerReconciliation — what it reports', () => {
  it('passes the ledger backfill result through untouched', async () => {
    mocks.reconcileLedger.mockResolvedValue({ created: 7, skipped: 2 })

    const summary = await executeLedgerReconciliation(freshStep)

    expect(summary.ledger).toEqual({ created: 7, skipped: 2 })
  })

  it('does not claim a count of contributions it never examined', async () => {
    mocks.queryRaw.mockResolvedValue([drift('c1'), drift('c2')])

    const summary = await executeLedgerReconciliation(freshStep)

    // The query returns only rows that have already drifted, so there is no
    // "checked" total to report. It used to return drifted + corrected, which
    // counted the same two contributions twice and called it four.
    expect(summary).not.toHaveProperty('checked')
  })
})
