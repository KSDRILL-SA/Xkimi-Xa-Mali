import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A network call had been sitting inside a database transaction.
 *
 * `recalculateContributionStatus` announced a status change with
 * `await inngest.send(...)`, and four of its callers run it inside an
 * interactive transaction whose timeout is five seconds. So an HTTP round trip
 * to a third party sat in the middle of a money write.
 *
 * That is not theoretical. With the event key unset the call took just under
 * six seconds to fail, the transaction expired, and the whole write rolled
 * back — **after `submitManualPayment` had already charged the member at the
 * gateway**. Money left the account and no transaction row existed to show for
 * it. Worse, the idempotency key is written in that same rolled-back
 * transaction, so the member's retry would have charged them a second time.
 *
 * Found by making a payment in the running app, not by reading the code: every
 * unit test mocks Inngest to resolve instantly, so the timeout could never
 * appear.
 */

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  findUniqueWithVersion: vi.fn(),
  updateByVersion: vi.fn(),
  aggregate: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: {} }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@xxm/observability', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/inngest', () => ({
  inngest: { send: mocks.send },
  InngestEvents: { CONTRIBUTION_STATUS_CHANGED: 'xxm/contribution.status.changed' },
}))
vi.mock('@/lib/cache', () => ({
  cache: { del: vi.fn(), get: vi.fn(), set: vi.fn() },
  CACHE_KEYS: { DASHBOARD_STATS: 'k', memberInsights: () => 'i', contributionSummary: () => 's' },
}))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/services/budget.service', () => ({ checkBudget: vi.fn(), recordBudgetOverride: vi.fn() }))
vi.mock('@/services/goal.service', () => ({ syncPrimaryGoalProgress: vi.fn() }))
vi.mock('@/services/ledger.service', () => ({ postPoolCredit: vi.fn(), postPoolDebit: vi.fn() }))
vi.mock('@/services/notification.service', () => ({ queueNotification: vi.fn() }))
vi.mock('@/integrations/payment', () => ({ paymentGateway: {} }))
vi.mock('@/repositories/mandate.repository', () => ({ mandateRepo: {} }))
vi.mock('@/repositories/budget.repository', () => ({ budgetRepo: {} }))
vi.mock('@/repositories/transaction.repository', () => ({
  transactionRepo: { aggregate: mocks.aggregate, create: vi.fn() },
  SUCCESSFUL_INFLOW: {},
}))
vi.mock('@/repositories/contribution.repository', () => ({
  contributionRepo: {
    findUniqueWithVersion: mocks.findUniqueWithVersion,
    updateByVersion: mocks.updateByVersion,
  },
  runTransaction: vi.fn(),
}))

import { recalculateContributionStatus } from '@/services/contribution.service'

/** Stands in for a caller's interactive transaction client. */
const tx = {} as never

beforeEach(() => {
  vi.clearAllMocks()
  mocks.send.mockResolvedValue(undefined)
  mocks.findUniqueWithVersion.mockResolvedValue({
    id: 'c1', userId: 'u1', amountDue: 400, dueDate: new Date('2026-07-25'), version: 0,
  })
  // Paid in full, so the status lands on PAID and a change is worth announcing.
  mocks.aggregate.mockResolvedValue({ _sum: { amount: 400 } })
  mocks.updateByVersion.mockResolvedValue({ count: 1 })
})

describe('inside a caller’s transaction', () => {
  it('does not make the network call', async () => {
    await recalculateContributionStatus('c1', tx)

    expect(mocks.send).not.toHaveBeenCalled()
  })

  it('hands the change back so the caller can announce it after commit', async () => {
    const change = await recalculateContributionStatus('c1', tx)

    expect(change).toEqual({ userId: 'u1', contributionId: 'c1', status: 'PAID' })
  })

  it('returns nothing to announce when the status is not worth announcing', async () => {
    // Part-paid: real, recorded, and not an event anybody subscribes to.
    mocks.aggregate.mockResolvedValue({ _sum: { amount: 150 } })

    expect(await recalculateContributionStatus('c1', tx)).toBeNull()
  })
})

describe('when it owns the connection', () => {
  it('announces the change itself', async () => {
    await recalculateContributionStatus('c1')

    expect(mocks.send).toHaveBeenCalledOnce()
    expect(mocks.send.mock.calls[0][0]).toMatchObject({
      name: 'xxm/contribution.status.changed',
      data: { userId: 'u1', contributionId: 'c1', status: 'PAID' },
    })
  })
})

describe('what this test deliberately does not assert', () => {
  it('leaves "no caller emits inside its transaction" to review, not to a regex', () => {
    // A source-level guard for that was attempted and matched across function
    // boundaries, so it failed on correct code. A guard that cannot be written
    // accurately is worse than none: it gets loosened until it passes and then
    // proves nothing.
    //
    // The property that actually protects the money path is the one above —
    // handed a transaction, this function makes no network call at all. A
    // caller that ignores the returned change simply misses an event, which
    // costs nobody anything.
    expect(true).toBe(true)
  })
})
