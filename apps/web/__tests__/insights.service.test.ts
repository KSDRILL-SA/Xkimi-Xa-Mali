import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    contribution: { aggregate: vi.fn(), findMany: vi.fn() },
    paymentMandate: { findFirst: vi.fn() },
    transaction: { count: vi.fn() },
    goal: { findMany: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import { computeStreak, pickGoalNearingTarget, getMemberInsights } from '@/services/insights.service'

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

describe('pickGoalNearingTarget', () => {
  it('returns null when nothing is close enough', () => {
    expect(pickGoalNearingTarget([])).toBeNull()
    expect(pickGoalNearingTarget([{ title: 'Early', targetAmount: 1000, currentAmount: 100 }])).toBeNull()
  })

  it('picks a goal at/above the threshold and reports the exact shortfall', () => {
    const res = pickGoalNearingTarget([{ title: 'December Fund', targetAmount: 1000, currentAmount: 800 }])
    expect(res).toEqual({ title: 'December Fund', pct: 80, remaining: 200 })
  })

  it('prefers the most-funded qualifying goal', () => {
    const res = pickGoalNearingTarget([
      { title: 'A', targetAmount: 1000, currentAmount: 750 },
      { title: 'B', targetAmount: 1000, currentAmount: 950 },
    ])
    expect(res!.title).toBe('B')
    expect(res!.pct).toBe(95)
  })

  it('ignores completed goals and zero-target goals', () => {
    expect(pickGoalNearingTarget([{ title: 'Done', targetAmount: 1000, currentAmount: 1000 }])).toBeNull()
    expect(pickGoalNearingTarget([{ title: 'Bad', targetAmount: 0, currentAmount: 0 }])).toBeNull()
  })
})

describe('getMemberInsights — streak surfaced as a nudge', () => {
  beforeEach(() => vi.clearAllMocks())

  function arm(
    periodRows: Array<{ periodYear: number; periodMonth: number; status: string }>,
    goals: Array<{ title: string; targetAmount: number; currentAmount: number }> = [],
  ) {
    ;(db.contribution.aggregate as MockedFunction<typeof db.contribution.aggregate>)
      .mockResolvedValue({ _sum: { amountPaid: 1500 } } as never)
    ;(db.paymentMandate.findFirst as MockedFunction<typeof db.paymentMandate.findFirst>)
      .mockResolvedValue({ amount: 500, debitDay: 25 } as never)
    ;(db.transaction.count as MockedFunction<typeof db.transaction.count>)
      .mockResolvedValue(0 as never)
    ;(db.contribution.findMany as MockedFunction<typeof db.contribution.findMany>)
      .mockResolvedValue(periodRows as never)
    ;(db.goal.findMany as MockedFunction<typeof db.goal.findMany>)
      .mockResolvedValue(goals as never)
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

  it('shows a focused "one month away" nudge when a milestone is within reach', async () => {
    arm(periods('PAID', 'PAID', 'PAID', 'PAID', 'PAID')) // current 5 → 1 short of 6

    const result = await getMemberInsights('u1', 'u1', [])

    expect(result.insights.some((i) => i.code === 'STREAK_MILESTONE')).toBe(true)
    // Only one streak-related nudge — the milestone replaces the generic one.
    expect(result.insights.some((i) => i.code === 'STREAK' || i.code === 'STREAK_RECORD')).toBe(false)
  })

  it('rallies the group around a goal that is nearly funded', async () => {
    arm(periods('PAID', 'PENDING'), [{ title: 'Roof Fund', targetAmount: 1000, currentAmount: 850 }])

    const result = await getMemberInsights('u1', 'u1', [])

    const goalNudge = result.insights.find((i) => i.code === 'GOAL_NEAR')
    expect(goalNudge).toBeDefined()
    expect(goalNudge!.tone).toBe('positive')
    expect(goalNudge!.detail).toContain('85%')
  })
})
