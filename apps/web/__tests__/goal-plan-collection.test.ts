import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  findDue: vi.fn(),
  updateByVersion: vi.fn(),
  mandateFindActive: vi.fn(),
  payToGoal: vi.fn(),
  queueNotification: vi.fn(),
}))

vi.mock('@/integrations/payment', () => ({
  // These tests describe the world where a provider exists: a plan is honoured
  // by collecting from a debit order, so the mandate requirement applies. The
  // offline path — where nothing can collect and the plan asks instead — is
  // covered in `goal-plan-offline.test.ts`.
  GATEWAY_CAN_MOVE_MONEY: true,
}))
vi.mock('@/lib/env', () => ({ env: {} }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@xxm/observability', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/authorization', () => ({ assertCanAccess: vi.fn() }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/services/notification.service', () => ({ queueNotification: mocks.queueNotification }))
vi.mock('@/services/goal-payment.service', () => ({ payToGoal: mocks.payToGoal }))
vi.mock('@/repositories', () => ({
  goalRepo: { findById: vi.fn() },
  mandateRepo: { findActiveByUser: mocks.mandateFindActive },
  goalPlanRepo: {
    findDueCandidates: mocks.findDue,
    updateByVersion: mocks.updateByVersion,
    findActive: vi.fn(),
    create: vi.fn(),
    sumActiveAmounts: vi.fn(),
  },
}))

import { collectDuePlans } from '@/services/goal-plan.service'

/** The 25th of August 2026 — a plan's collection day. */
const TODAY = new Date(2026, 7, 25)

function plan(over: Record<string, unknown> = {}) {
  return {
    id: 'p1', userId: 'u1', goalId: 'g1', amount: 750, debitDay: 25,
    lastCollectedPeriod: null, failedRuns: 0, version: 0,
    goal: {
      id: 'g1', title: 'School Fees', targetAmount: 3000, currentAmount: 0,
      deadline: new Date(2026, 11, 1), status: 'ACTIVE',
    },
    ...over,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.mandateFindActive.mockResolvedValue({ netcashMandateId: 'NC-1' })
  mocks.updateByVersion.mockResolvedValue({ count: 1 })
  mocks.payToGoal.mockResolvedValue({ status: 'SUCCESS' })
  mocks.queueNotification.mockResolvedValue(undefined)
})

describe('collecting a due plan', () => {
  it('charges the instalment against the member’s own mandate', async () => {
    mocks.findDue.mockResolvedValue([plan()])

    const res = await collectDuePlans(TODAY)

    expect(res.collected).toBe(1)
    const [goalId, userId, requesterId, roles, amount, , token] = mocks.payToGoal.mock.calls[0]!
    expect({ goalId, userId, requesterId, roles, amount }).toEqual({
      goalId: 'g1', userId: 'u1', requesterId: 'u1', roles: [], amount: 750,
    })
    // The key carries the period, so a retry of this collection collapses onto
    // the payment it already made rather than making a second one.
    expect(token).toBe('plan:p1:2026-08')
  })

  it('claims the period before it charges', async () => {
    // A job that dies between the charge and the stamp would otherwise leave
    // the plan looking un-collected, and a rerun would try again.
    mocks.findDue.mockResolvedValue([plan()])

    await collectDuePlans(TODAY)

    const claimOrder = mocks.updateByVersion.mock.invocationCallOrder[0]!
    const payOrder = mocks.payToGoal.mock.invocationCallOrder[0]!
    expect(claimOrder).toBeLessThan(payOrder)
    expect(mocks.updateByVersion.mock.calls[0]![2]).toEqual({ lastCollectedPeriod: '2026-08' })
  })

  it('does not charge a plan that already collected this month', async () => {
    mocks.findDue.mockResolvedValue([plan({ lastCollectedPeriod: '2026-08' })])

    const res = await collectDuePlans(TODAY)

    expect(mocks.payToGoal).not.toHaveBeenCalled()
    expect(res.collected).toBe(0)
  })

  it('does not charge when another run claimed the plan first', async () => {
    // updateByVersion matching nothing means the row moved under us — a
    // concurrent run, or the member cancelling at that moment.
    mocks.findDue.mockResolvedValue([plan()])
    mocks.updateByVersion.mockResolvedValue({ count: 0 })

    await collectDuePlans(TODAY)

    expect(mocks.payToGoal).not.toHaveBeenCalled()
  })

  it('trims the last instalment to what the goal still needs', async () => {
    mocks.findDue.mockResolvedValue([plan({ goal: { ...plan().goal, currentAmount: 2900 } })])

    await collectDuePlans(TODAY)

    expect(mocks.payToGoal.mock.calls[0]![4]).toBe(100)
  })

  it('collects on the last day of a short month for a late debit day', async () => {
    mocks.findDue.mockResolvedValue([plan({ debitDay: 31 })])

    const res = await collectDuePlans(new Date(2026, 1, 28))

    expect(res.collected).toBe(1)
  })
})

describe('when a plan should stop', () => {
  it('completes once the goal has reached its target', async () => {
    mocks.findDue.mockResolvedValue([plan({ goal: { ...plan().goal, currentAmount: 3000 } })])

    const res = await collectDuePlans(TODAY)

    expect(mocks.payToGoal).not.toHaveBeenCalled()
    expect(res.completed).toBe(1)
    expect(mocks.updateByVersion.mock.calls[0]![2]).toMatchObject({ status: 'COMPLETED' })
  })

  it('completes once the deadline has passed', async () => {
    mocks.findDue.mockResolvedValue([plan({ goal: { ...plan().goal, deadline: new Date(2026, 6, 1) } })])

    const res = await collectDuePlans(TODAY)

    expect(mocks.payToGoal).not.toHaveBeenCalled()
    expect(res.completed).toBe(1)
  })

  it('completes when the goal is no longer active', async () => {
    mocks.findDue.mockResolvedValue([plan({ goal: { ...plan().goal, status: 'ACHIEVED' } })])

    const res = await collectDuePlans(TODAY)

    expect(mocks.payToGoal).not.toHaveBeenCalled()
    expect(res.completed).toBe(1)
  })

  it('pauses rather than ends when the debit order is gone', async () => {
    // The member can resume a paused plan. Ending it would throw away what they
    // set up over a mandate they may well replace.
    mocks.findDue.mockResolvedValue([plan()])
    mocks.mandateFindActive.mockResolvedValue(null)

    const res = await collectDuePlans(TODAY)

    expect(mocks.payToGoal).not.toHaveBeenCalled()
    expect(res.paused).toBe(1)
    expect(mocks.updateByVersion.mock.calls[0]![2]).toMatchObject({ status: 'PAUSED' })
  })
})

describe('when a collection fails', () => {
  it('counts the failure and leaves the plan running', async () => {
    mocks.findDue.mockResolvedValue([plan()])
    mocks.payToGoal.mockResolvedValue({ status: 'FAILED' })

    const res = await collectDuePlans(TODAY)

    expect(res.failed).toBe(1)
    expect(mocks.updateByVersion).toHaveBeenLastCalledWith('p1', 1, { failedRuns: 1 })
  })

  it('counts a thrown error as a failure rather than losing the run', async () => {
    mocks.findDue.mockResolvedValue([plan()])
    mocks.payToGoal.mockRejectedValue(new Error('gateway unreachable'))

    const res = await collectDuePlans(TODAY)

    expect(res.failed).toBe(1)
  })

  it('one plan failing does not stop the rest', async () => {
    mocks.findDue.mockResolvedValue([plan(), plan({ id: 'p2' })])
    mocks.payToGoal.mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ status: 'SUCCESS' })

    const res = await collectDuePlans(TODAY)

    expect(res).toMatchObject({ failed: 1, collected: 1 })
  })

  it('clears the failure count after a success', async () => {
    mocks.findDue.mockResolvedValue([plan({ failedRuns: 2 })])

    await collectDuePlans(TODAY)

    expect(mocks.updateByVersion).toHaveBeenLastCalledWith('p1', 1, { failedRuns: 0 })
  })
})
