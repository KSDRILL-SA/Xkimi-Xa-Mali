import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Two small defects on the goal-plan path, and one of them runs the opposite
// way to everything else in this audit.
//
// **Resuming a paused plan** never checked whether a newer active plan already
// existed for the goal. The audit filed that as "two ACTIVE plans result".
// They do not: `goal_plans_user_goal_active_key` is unique on (userId, goalId)
// among ACTIVE rows, so Postgres refuses the second one.
//
// So the invariant was safe, and the member got a raw constraint violation from
// a function that returns a clear message for every other refusal it makes.
// Everywhere else in this work the application held a rule the database did
// not; here the database held one the application had forgotten. The index did
// its job — this only says so in words a person can act on.
//
// **The collection loop** claimed a plan with `updateByVersion(id, version)`
// and checked the count, which is right and is what stops two runs collecting
// the same plan. Its three follow-up writes then used `version + 1` and threw
// the result away — assuming the claim was the only thing to touch the row in
// between. A member resuming or cancelling mid-run moves the version again, and
// the follow-up matches nothing and vanishes.
//
// What vanishes is `failedRuns`: the counter that pauses a plan which keeps
// failing and tells the member why. A plan could fail repeatedly, lose the
// increment each time, and never pause — the one outcome the counter exists to
// produce.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findActive: vi.fn(),
  updateByVersion: vi.fn(),
  findDue: vi.fn(),
  findActiveByUser: vi.fn(),
  payToGoal: vi.fn(),
  writeAuditLog: vi.fn(),
  queueNotification: vi.fn(),
  warn: vi.fn(),
  findGoal: vi.fn(),
}))

vi.mock('@/repositories/goal-plan.repository', () => ({
  goalPlanRepo: {
    findById: mocks.findById,
    findActive: mocks.findActive,
    updateByVersion: mocks.updateByVersion,
    findDueCandidates: mocks.findDue,
    sumActiveAmounts: vi.fn(),
    create: vi.fn(),
  },
}))
vi.mock('@/repositories/mandate.repository', () => ({
  mandateRepo: { findActiveByUser: mocks.findActiveByUser },
}))
vi.mock('@/repositories/goal.repository', () => ({ goalRepo: { findById: mocks.findGoal } }))
vi.mock('@/services/goal-payment.service', () => ({ payToGoal: mocks.payToGoal }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/services/notification.service', () => ({ queueNotification: mocks.queueNotification }))
vi.mock('@xxm/observability', () => ({
  logger: { warn: mocks.warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { resumePlan, collectDuePlans } from '@/services/goal-plan.service'
import { GoalConflictError } from '@/lib/errors'

const PAUSED = {
  id: 'plan-1', userId: 'u1', goalId: 'g1', status: 'PAUSED',
  version: 3, failedRuns: 2, amount: 200, debitDay: 25,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findById.mockResolvedValue({ ...PAUSED })
  mocks.findActive.mockResolvedValue(null)
  mocks.updateByVersion.mockResolvedValue({ count: 1 })
  mocks.findActiveByUser.mockResolvedValue({ netcashMandateId: 'nc-1' })
  mocks.findGoal.mockResolvedValue({
    id: 'g1', status: 'ACTIVE', title: 'Vehicle',
    targetAmount: 50000, currentAmount: 0, deadline: new Date(Date.now() + 9e9),
  })
  mocks.writeAuditLog.mockResolvedValue(undefined)
  mocks.queueNotification.mockResolvedValue(undefined)
})

describe('resuming a plan when another is already live', () => {
  it('refuses with a message the member can act on', async () => {
    // Not a raw unique-constraint error from Postgres. The index would have
    // refused it either way; a member reading the result has to be told what
    // to do about it.
    mocks.findActive.mockResolvedValue({ id: 'plan-2', userId: 'u1', goalId: 'g1' })

    await expect(resumePlan('plan-1', 'u1', 'u1', [])).rejects.toBeInstanceOf(GoalConflictError)
    await expect(resumePlan('plan-1', 'u1', 'u1', [])).rejects.toThrow(/already have an active plan/i)
  })

  it('does not write when it refuses', async () => {
    mocks.findActive.mockResolvedValue({ id: 'plan-2', userId: 'u1', goalId: 'g1' })

    await expect(resumePlan('plan-1', 'u1', 'u1', [])).rejects.toThrow()

    expect(mocks.updateByVersion).not.toHaveBeenCalled()
  })

  it('checks before asking about the mandate', async () => {
    // Order matters for the message the member sees: "you already have a plan"
    // is more useful than "you need a debit order" when both are true.
    mocks.findActive.mockResolvedValue({ id: 'plan-2', userId: 'u1', goalId: 'g1' })
    mocks.findActiveByUser.mockResolvedValue(null)

    await expect(resumePlan('plan-1', 'u1', 'u1', [])).rejects.toThrow(/already have an active plan/i)
  })

  it('resumes normally when nothing else is live', async () => {
    await expect(resumePlan('plan-1', 'u1', 'u1', [])).resolves.toMatchObject({ resumed: true })
  })

  it('is not confused by finding the plan being resumed', async () => {
    // `findActive` looks for an ACTIVE plan; a PAUSED one should not appear.
    // If a future change makes it broader, the plan must not block itself.
    mocks.findActive.mockResolvedValue({ id: 'plan-1', userId: 'u1', goalId: 'g1' })

    await expect(resumePlan('plan-1', 'u1', 'u1', [])).resolves.toMatchObject({ resumed: true })
  })
})

describe('failure bookkeeping that loses a race says so', () => {
  const DUE = {
    id: 'plan-1', userId: 'u1', goalId: 'g1', status: 'ACTIVE',
    version: 3, failedRuns: 0, amount: 200, debitDay: new Date().getDate(),
    lastCollectedPeriod: null,
    goal: { id: 'g1', status: 'ACTIVE', title: 'Vehicle', targetAmount: 50000, currentAmount: 0, deadline: new Date(Date.now() + 9e9) },
  }

  beforeEach(() => {
    mocks.findDue.mockResolvedValue([{ ...DUE }])
    mocks.payToGoal.mockResolvedValue({ status: 'FAILED' })
  })

  it('logs when the failure count could not be recorded', async () => {
    // The claim succeeds; the follow-up finds the version moved because the
    // member cancelled or resumed mid-run. The charge stands — only the tally
    // was lost, and losing it silently is how a failing plan never pauses.
    mocks.updateByVersion
      .mockResolvedValueOnce({ count: 1 })   // the claim
      .mockResolvedValueOnce({ count: 0 })   // the failure count

    await collectDuePlans()

    expect(mocks.warn).toHaveBeenCalledWith(
      expect.stringMatching(/failure count not recorded/i),
      expect.objectContaining({ planId: 'plan-1' }),
    )
  })

  it('says nothing when the count was recorded', async () => {
    mocks.updateByVersion.mockResolvedValue({ count: 1 })

    await collectDuePlans()

    expect(mocks.warn).not.toHaveBeenCalledWith(
      expect.stringMatching(/failure count/i),
      expect.anything(),
    )
  })

  it('logs when a recovered plan could not be cleared', async () => {
    // The mirror case: a plan that had failures and has now collected.
    mocks.findDue.mockResolvedValue([{ ...DUE, failedRuns: 2 }])
    mocks.payToGoal.mockResolvedValue({ status: 'SUCCESS' })
    mocks.updateByVersion
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    await collectDuePlans()

    expect(mocks.warn).toHaveBeenCalledWith(
      expect.stringMatching(/failure count not cleared/i),
      expect.objectContaining({ planId: 'plan-1' }),
    )
  })

  it('still claims against the version it read', async () => {
    // Unchanged, and the part that actually prevents a double collection.
    await collectDuePlans()

    expect(mocks.updateByVersion).toHaveBeenNthCalledWith(
      1, 'plan-1', 3, expect.objectContaining({ lastCollectedPeriod: expect.any(String) }),
    )
  })
})
