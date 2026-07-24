import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/repositories/budget.repository', () => ({
  budgetRepo: {
    findActiveByType: vi.fn(),
    createOverride: vi.fn(),
    create: vi.fn(),
    deactivate: vi.fn(),
    findAllByUser: vi.fn(),
  },
}))
vi.mock('@/repositories/contribution.repository', () => ({
  contributionRepo: { sumPaidInPeriod: vi.fn() },
  runTransaction: vi.fn((fn: (tx: unknown) => unknown) => fn({})),
}))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))

import { budgetRepo } from '@/repositories/budget.repository'
import { contributionRepo } from '@/repositories/contribution.repository'
import { writeAuditLog } from '@/services/audit.service'
import {
  checkBudget,
  checkMandateAgainstBudget,
  createBudget,
} from '@/services/budget.service'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>

beforeEach(() => vi.clearAllMocks())

describe('checkBudget — the budget guard', () => {
  it('returns NO_BUDGET when the member has no active budget', async () => {
    mock(budgetRepo.findActiveByType).mockResolvedValue(null as never)

    const res = await checkBudget('u1', 100)

    expect(res).toEqual({ status: 'NO_BUDGET' })
  })

  it('returns WITHIN_BUDGET when the contribution keeps the total at or under the cap', async () => {
    mock(budgetRepo.findActiveByType).mockResolvedValue({ amount: 1000 } as never)
    mock(contributionRepo.sumPaidInPeriod).mockResolvedValue(600 as never)

    const res = await checkBudget('u1', 400)

    // 600 already + 400 = 1000, exactly at the cap → within.
    expect(res).toEqual({ status: 'WITHIN_BUDGET', remaining: 400, wouldTotal: 1000 })
  })

  it('returns OVER_BUDGET with the exact overage when the cap is exceeded', async () => {
    mock(budgetRepo.findActiveByType).mockResolvedValue({ amount: 1000 } as never)
    mock(contributionRepo.sumPaidInPeriod).mockResolvedValue(800 as never)

    const res = await checkBudget('u1', 300)

    expect(res).toEqual({
      status: 'OVER_BUDGET',
      budget: 1000,
      alreadyContributed: 800,
      remaining: 200,
      wouldTotal: 1100,
      overage: 100,
    })
  })
})

describe('checkMandateAgainstBudget — warn, never block', () => {
  it('does not warn when there is no budget', async () => {
    mock(budgetRepo.findActiveByType).mockResolvedValue(null as never)
    expect(await checkMandateAgainstBudget('u1', 5000)).toEqual({ warning: false })
  })

  it('does not warn when the mandate is within the monthly budget', async () => {
    mock(budgetRepo.findActiveByType).mockResolvedValue({ amount: 1000 } as never)
    expect(await checkMandateAgainstBudget('u1', 1000)).toEqual({ warning: false })
  })

  it('warns with the overage when the mandate exceeds the budget', async () => {
    mock(budgetRepo.findActiveByType).mockResolvedValue({ amount: 1000 } as never)
    expect(await checkMandateAgainstBudget('u1', 1500)).toEqual({
      warning: true,
      budget: 1000,
      mandateAmount: 1500,
      overage: 500,
    })
  })
})

describe('createBudget — atomic replace of the active budget', () => {
  it('deactivates the existing active budget and creates the new one in one transaction', async () => {
    mock(budgetRepo.findActiveByType).mockResolvedValue({ id: 'old' } as never)
    mock(budgetRepo.deactivate).mockResolvedValue({} as never)
    mock(budgetRepo.create).mockResolvedValue({
      id: 'new', type: 'MONTHLY', amount: 2000, startDate: new Date(), endDate: null,
      isActive: true, createdAt: new Date(), updatedAt: new Date(),
    } as never)

    // requesterId === userId so the ownership assert passes.
    await createBudget('u1', 'u1', ['MEMBER'], {
      type: 'MONTHLY', amount: 2000, startDate: '2026-08-01',
    } as never)

    expect(budgetRepo.deactivate).toHaveBeenCalledWith('old', expect.anything())
    expect(budgetRepo.create).toHaveBeenCalled()
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'BUDGET_CREATED' }),
    )
  })
})
