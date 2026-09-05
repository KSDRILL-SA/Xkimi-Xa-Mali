import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  goalFindById: vi.fn(),
  planFindActive: vi.fn(),
  planCreate: vi.fn(),
  planSumActive: vi.fn(),
  planFindById: vi.fn(),
  planUpdate: vi.fn(),
  mandateFindActive: vi.fn(),
  audit: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: {} }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@xxm/observability', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/authorization', () => ({ assertCanAccess: vi.fn() }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: mocks.audit }))
vi.mock('@/integrations/payment', () => ({
  paymentGateway: { submitOnceOffDebit: vi.fn(), mapTransactionStatus: vi.fn() },
  // These tests describe the world where a provider exists: a plan is honoured
  // by collecting from a debit order, so the mandate requirement applies. The
  // offline path — where nothing can collect and the plan asks instead — is
  // covered in `goal-plan-offline.test.ts`.
  GATEWAY_CAN_MOVE_MONEY: true,
}))
vi.mock('@/repositories', () => ({
  goalRepo: { findById: mocks.goalFindById },
  mandateRepo: { findActiveByUser: mocks.mandateFindActive },
  goalPlanRepo: {
    findActive: mocks.planFindActive,
    create: mocks.planCreate,
    sumActiveAmounts: mocks.planSumActive,
    findById: mocks.planFindById,
    updateByVersion: mocks.planUpdate,
  },
}))

import { enrolInPlan, suggestPlan, monthsUntil, resumePlan } from '@/services/goal-plan.service'

const FUTURE = new Date(Date.now() + 120 * 86_400_000) // ~4 months out

beforeEach(() => {
  vi.clearAllMocks()
  mocks.goalFindById.mockResolvedValue({
    id: 'g1', title: 'School Fees', targetAmount: 3000, currentAmount: 0,
    deadline: FUTURE, status: 'ACTIVE',
  })
  mocks.mandateFindActive.mockResolvedValue({ netcashMandateId: 'NC-1' })
  mocks.planFindActive.mockResolvedValue(null)
  mocks.planCreate.mockImplementation((d: unknown) => Promise.resolve({ id: 'p1', ...(d as object) }))
  mocks.planSumActive.mockResolvedValue({ _sum: { amount: 400 } })
})

describe('months until a deadline', () => {
  it('counts whole months between two dates', () => {
    expect(monthsUntil(new Date(2026, 11, 1), new Date(2026, 7, 1))).toBe(4)
  })

  it('never returns zero, so the suggestion cannot divide by it', () => {
    // A deadline this month or already past would otherwise produce Infinity
    // and offer the member an impossible instalment.
    expect(monthsUntil(new Date(2026, 7, 20), new Date(2026, 7, 1))).toBe(1)
    expect(monthsUntil(new Date(2026, 5, 1), new Date(2026, 7, 1))).toBe(1)
  })
})

describe('what a plan suggests', () => {
  it('spreads what is left over the months left', async () => {
    const s = await suggestPlan('g1', 'u1', 'u1', [])
    expect(s.remaining).toBe(3000)
    expect(s.suggested).toBe(Math.round(3000 / s.months))
  })

  it('reports what the member is already committed to each month', async () => {
    // So the enrolment screen can show the true total rather than this plan
    // alone — several plans plus a contribution is several debits.
    const s = await suggestPlan('g1', 'u1', 'u1', [])
    expect(s.committedMonthly).toBe(400)
  })
})

describe('starting a plan', () => {
  it('records the amount and the day', async () => {
    await enrolInPlan('g1', 'u1', 'u1', [], 750, 25)
    expect(mocks.planCreate).toHaveBeenCalledWith({ userId: 'u1', goalId: 'g1', amount: 750, debitDay: 25 })
  })

  it('refuses without an active debit order', async () => {
    // Asked now rather than at the first collection. Otherwise the member hears
    // nothing until a collection day weeks away fails quietly.
    mocks.mandateFindActive.mockResolvedValue(null)
    await expect(enrolInPlan('g1', 'u1', 'u1', [], 750, 25)).rejects.toThrow(/debit order/i)
    expect(mocks.planCreate).not.toHaveBeenCalled()
  })

  it('refuses a second plan for the same goal', async () => {
    mocks.planFindActive.mockResolvedValue({ id: 'existing' })
    await expect(enrolInPlan('g1', 'u1', 'u1', [], 750, 25)).rejects.toThrow(/already have a plan/i)
    expect(mocks.planCreate).not.toHaveBeenCalled()
  })

  it('refuses a goal that is not active', async () => {
    mocks.goalFindById.mockResolvedValue({
      id: 'g1', title: 'Done', targetAmount: 3000, currentAmount: 3000,
      deadline: FUTURE, status: 'ACHIEVED',
    })
    await expect(enrolInPlan('g1', 'u1', 'u1', [], 750, 25)).rejects.toThrow(/active goal/i)
  })

  it('refuses a goal whose deadline has passed', async () => {
    mocks.goalFindById.mockResolvedValue({
      id: 'g1', title: 'Late', targetAmount: 3000, currentAmount: 0,
      deadline: new Date(Date.now() - 86_400_000), status: 'ACTIVE',
    })
    await expect(enrolInPlan('g1', 'u1', 'u1', [], 750, 25)).rejects.toThrow(/deadline/i)
  })

  it('refuses a debit day that no month has', async () => {
    await expect(enrolInPlan('g1', 'u1', 'u1', [], 750, 32)).rejects.toThrow(/between 1 and 31/i)
    await expect(enrolInPlan('g1', 'u1', 'u1', [], 750, 0)).rejects.toThrow(/between 1 and 31/i)
  })

  it('refuses an amount below the minimum', async () => {
    await expect(enrolInPlan('g1', 'u1', 'u1', [], 1, 25)).rejects.toThrow(/minimum/i)
  })
})

describe('resuming a paused plan', () => {
  beforeEach(() => {
    mocks.planFindById.mockResolvedValue({
      id: 'p1', userId: 'u1', goalId: 'g1', status: 'PAUSED', version: 3,
    })
    mocks.planUpdate.mockResolvedValue({ count: 1 })
  })

  it('brings it back to ACTIVE and clears why it stopped', async () => {
    // The collection job pauses a plan itself when the mandate behind it is
    // gone. Before this there was no way back — the member replaced their debit
    // order and the plan stayed paused for good, with nothing to click.
    await resumePlan('p1', 'u1', 'u1', [])

    expect(mocks.planUpdate).toHaveBeenCalledWith('p1', 3, {
      status: 'ACTIVE', endedReason: null, failedRuns: 0,
    })
  })

  it('refuses while there is still no debit order to collect from', async () => {
    // Otherwise the next collection pauses it straight back and the member
    // learns nothing from having pressed the button.
    mocks.mandateFindActive.mockResolvedValue(null)

    await expect(resumePlan('p1', 'u1', 'u1', [])).rejects.toThrow(/debit order/i)
    expect(mocks.planUpdate).not.toHaveBeenCalled()
  })

  it('refuses a plan the member cancelled themselves', async () => {
    // Terminal by intent. Reviving it would take money nobody asked for.
    mocks.planFindById.mockResolvedValue({ id: 'p1', userId: 'u1', goalId: 'g1', status: 'CANCELLED', version: 1 })

    await expect(resumePlan('p1', 'u1', 'u1', [])).rejects.toThrow(/only a paused plan/i)
  })

  it('refuses a plan whose goal has closed', async () => {
    mocks.goalFindById.mockResolvedValue({
      id: 'g1', title: 'Done', targetAmount: 3000, currentAmount: 3000,
      deadline: FUTURE, status: 'ACHIEVED',
    })

    await expect(resumePlan('p1', 'u1', 'u1', [])).rejects.toThrow(/no longer open/i)
    expect(mocks.planUpdate).not.toHaveBeenCalled()
  })

  it('refuses another member’s plan', async () => {
    mocks.planFindById.mockResolvedValue({ id: 'p1', userId: 'someone-else', goalId: 'g1', status: 'PAUSED', version: 1 })

    await expect(resumePlan('p1', 'u1', 'u1', [])).rejects.toThrow()
    expect(mocks.planUpdate).not.toHaveBeenCalled()
  })

  it('reports a race rather than silently doing nothing', async () => {
    // updateByVersion matching nothing means the collection job moved the plan
    // between the read and the write.
    mocks.planUpdate.mockResolvedValue({ count: 0 })

    await expect(resumePlan('p1', 'u1', 'u1', [])).rejects.toThrow(/just changed/i)
  })
})
