import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  goalFindById: vi.fn(),
  planFindActive: vi.fn(),
  planCreate: vi.fn(),
  planSumActive: vi.fn(),
  mandateFindActive: vi.fn(),
  audit: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: {} }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@xxm/observability', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/authorization', () => ({ assertCanAccess: vi.fn() }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: mocks.audit }))
vi.mock('@/repositories', () => ({
  goalRepo: { findById: mocks.goalFindById },
  mandateRepo: { findActiveByUser: mocks.mandateFindActive },
  goalPlanRepo: {
    findActive: mocks.planFindActive,
    create: mocks.planCreate,
    sumActiveAmounts: mocks.planSumActive,
  },
}))

import { enrolInPlan, suggestPlan, monthsUntil } from '@/services/goal-plan.service'

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
