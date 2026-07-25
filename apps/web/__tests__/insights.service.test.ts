import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    contribution: { aggregate: vi.fn(), findMany: vi.fn() },
    paymentMandate: { findFirst: vi.fn() },
    transaction: { count: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import { computeStreak, getMemberInsights } from '@/services/insights.service'

// Build a period row list from a status sequence (oldest first).
function periods(...statuses: string[]) {
  return statuses.map((status, i) => ({ periodYear: 2025, periodMonth: i + 1, status }))
}

describe('computeStreak', () => {
  it('is zero for no history', () => {
    expect(computeStreak([])).toEqual({ current: 0, longest: 0 })
  })

  it('counts a clean run of paid months', () => {
    expect(computeStreak(periods('PAID', 'PAID', 'PAID'))).toEqual({ current: 3, longest: 3 })
  })

  it('ignores a trailing in-progress PENDING month', () => {
    expect(computeStreak(periods('PAID', 'PAID', 'PENDING'))).toEqual({ current: 2, longest: 2 })
  })

  it('breaks the current streak on an OVERDUE month but keeps the longest', () => {
    expect(computeStreak(periods('PAID', 'PAID', 'OVERDUE'))).toEqual({ current: 0, longest: 2 })
  })

  it('resumes after a break, tracking the best run', () => {
    expect(computeStreak(periods('PAID', 'PAID', 'OVERDUE', 'PAID'))).toEqual({ current: 1, longest: 2 })
  })

  it('treats a WAIVED month as transparent (neither breaks nor extends)', () => {
    expect(computeStreak(periods('PAID', 'WAIVED', 'PAID'))).toEqual({ current: 2, longest: 2 })
  })

  it('breaks on a PARTIAL month', () => {
    expect(computeStreak(periods('PAID', 'PARTIAL', 'PAID'))).toEqual({ current: 1, longest: 1 })
  })

  it('is order-independent (sorts by period internally)', () => {
    const shuffled = [
      { periodYear: 2025, periodMonth: 3, status: 'PAID' },
      { periodYear: 2025, periodMonth: 1, status: 'PAID' },
      { periodYear: 2024, periodMonth: 12, status: 'OVERDUE' },
      { periodYear: 2025, periodMonth: 2, status: 'PAID' },
    ]
    expect(computeStreak(shuffled)).toEqual({ current: 3, longest: 3 })
  })
})

describe('getMemberInsights — streak surfaced as a nudge', () => {
  beforeEach(() => vi.clearAllMocks())

  function arm(periodRows: Array<{ periodYear: number; periodMonth: number; status: string }>) {
    ;(db.contribution.aggregate as MockedFunction<typeof db.contribution.aggregate>)
      .mockResolvedValue({ _sum: { amountPaid: 1500 } } as never)
    ;(db.paymentMandate.findFirst as MockedFunction<typeof db.paymentMandate.findFirst>)
      .mockResolvedValue({ amount: 500, debitDay: 25 } as never)
    ;(db.transaction.count as MockedFunction<typeof db.transaction.count>)
      .mockResolvedValue(0 as never)
    ;(db.contribution.findMany as MockedFunction<typeof db.contribution.findMany>)
      .mockResolvedValue(periodRows as never)
  }

  it('includes the streak and a streak nudge when on a run', async () => {
    arm(periods('PAID', 'PAID', 'PAID', 'PENDING'))

    const result = await getMemberInsights('u1', 'u1', [])

    expect(result.streak).toEqual({ current: 3, longest: 3 })
    const streakNudge = result.insights.find((i) => i.code === 'STREAK' || i.code === 'STREAK_RECORD')
    expect(streakNudge).toBeDefined()
    expect(streakNudge!.tone).toBe('positive')
  })

  it('emits no streak nudge for a single paid month', async () => {
    arm(periods('OVERDUE', 'PAID'))

    const result = await getMemberInsights('u1', 'u1', [])

    expect(result.streak.current).toBe(1)
    expect(result.insights.some((i) => i.code.startsWith('STREAK'))).toBe(false)
  })
})
