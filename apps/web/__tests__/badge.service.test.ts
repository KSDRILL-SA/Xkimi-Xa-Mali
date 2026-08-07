import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/repositories/badge.repository', () => ({
  badgeRepo: {
    findByUser: vi.fn(),
    upsert: vi.fn().mockResolvedValue({}),
    createHistoryEntry: vi.fn().mockResolvedValue({}),
    findAllActiveUserIds: vi.fn(),
    findUsersInExpiredGrace: vi.fn(),
    findHistoryByUser: vi.fn(),
    findAllForCommunity: vi.fn(),
    findAllWithScores: vi.fn(),
    count: vi.fn(),
  },
}))
vi.mock('@/repositories/contribution.repository', () => ({
  contributionRepo: { findMany: vi.fn() },
}))
vi.mock('@/services/notification.service', () => ({
  queueNotification: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { badgeRepo } from '@/repositories/badge.repository'
import { contributionRepo } from '@/repositories/contribution.repository'
import { queueNotification } from '@/services/notification.service'
import { recalculateOne, recalculateAll, checkGraceExpiry } from '@/services/badge.service'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>

// ---------------------------------------------------------------------------
// Fixtures — months are relative to now so the six-month window stays stable.
// ---------------------------------------------------------------------------

function monthsAgo(n: number): Date {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return d
}

type Opts = { status?: string; amountPaid?: number; late?: boolean }

/** One contribution, `age` months back. On time unless told otherwise. */
function contribution(age: number, opts: Opts = {}) {
  const dueDate = monthsAgo(age)
  const settled = new Date(dueDate)
  settled.setDate(settled.getDate() + (opts.late ? 5 : -5))
  return {
    id: `c-${age}`,
    userId: 'u1',
    periodMonth: dueDate.getMonth() + 1,
    periodYear: dueDate.getFullYear(),
    status: opts.status ?? 'PAID',
    amountDue: 100,
    amountPaid: opts.amountPaid ?? 100,
    dueDate,
    updatedAt: settled,
  }
}

/** `count` consecutive months, oldest first, all paid on time. */
function perfectHistory(count: number, amountPaid = 100) {
  return Array.from({ length: count }, (_, i) => contribution(count - i, { amountPaid }))
}

const givenContributions = (rows: unknown[]) =>
  mock(contributionRepo.findMany).mockResolvedValue(rows as never)

const givenExistingScore = (score: unknown) =>
  mock(badgeRepo.findByUser).mockResolvedValue(score as never)

/** The record written by the run under test. */
function written() {
  const call = mock(badgeRepo.upsert).mock.calls.at(-1)
  return (call?.[1] ?? {}) as Record<string, number | string | Date | null>
}

beforeEach(() => {
  vi.clearAllMocks()
  mock(badgeRepo.upsert).mockResolvedValue({} as never)
  mock(badgeRepo.createHistoryEntry).mockResolvedValue({} as never)
  givenExistingScore(null)
})

// ---------------------------------------------------------------------------
// Tier rules — what members can see and compare, so it has to be defensible.
// ---------------------------------------------------------------------------

describe('tier is earned, not granted', () => {
  it('a brand-new member with nothing paid is AMATEUR', async () => {
    givenContributions([])
    const res = await recalculateOne('u1', 'test')
    expect(res.eligibleTier).toBe('AMATEUR')
  })

  it('two flawless months is still AMATEUR — three is the floor for SEMI_PRO', async () => {
    givenContributions(perfectHistory(2))
    expect((await recalculateOne('u1', 'test')).eligibleTier).toBe('AMATEUR')
  })

  it('three flawless months earns SEMI_PRO', async () => {
    givenContributions(perfectHistory(3))
    expect((await recalculateOne('u1', 'test')).eligibleTier).toBe('SEMI_PRO')
  })

  it('six flawless months earns PRO', async () => {
    givenContributions(perfectHistory(6))
    expect((await recalculateOne('u1', 'test')).eligibleTier).toBe('PRO')
  })

  it('twelve flawless months earns WORLD_CLASS', async () => {
    givenContributions(perfectHistory(12))
    expect((await recalculateOne('u1', 'test')).eligibleTier).toBe('WORLD_CLASS')
  })

  it('a single overdue month anywhere in the record blocks WORLD_CLASS', async () => {
    // Deliberately older than six months, so it is only totalOverdue that bites.
    givenContributions([contribution(18, { status: 'OVERDUE' }), ...perfectHistory(12)])
    expect((await recalculateOne('u1', 'test')).eligibleTier).not.toBe('WORLD_CLASS')
  })

  it('paying every month but always late costs the tier that rewards timeliness', async () => {
    givenContributions(Array.from({ length: 6 }, (_, i) => contribution(6 - i, { late: true })))
    const res = await recalculateOne('u1', 'test')
    // Every month paid, so consistency is perfect; none on time, so timeliness is nil.
    expect(written().consistencyScore).toBe(100)
    expect(written().timelinessScore).toBe(0)
    expect(res.eligibleTier).not.toBe('PRO')
  })
})

// ---------------------------------------------------------------------------
// Streaks
// ---------------------------------------------------------------------------

describe('streaks', () => {
  it('counts consecutive on-time months', async () => {
    givenContributions(perfectHistory(5))
    await recalculateOne('u1', 'test')
    expect(written().currentStreak).toBe(5)
    expect(written().longestStreak).toBe(5)
  })

  it('a missed month breaks the current streak but not the longest', async () => {
    givenContributions([
      ...perfectHistory(4).map((c, i) => ({ ...c, id: `old-${i}` })),
      contribution(3, { status: 'OVERDUE' }),
      contribution(2),
      contribution(1),
    ])
    await recalculateOne('u1', 'test')
    expect(written().currentStreak).toBe(2)
    expect(written().longestStreak).toBe(4)
  })

  it('the current unpaid month leaves the streak alone rather than breaking it', async () => {
    // A member mid-month has not failed at anything yet.
    givenContributions([...perfectHistory(3), contribution(0, { status: 'PENDING' })])
    await recalculateOne('u1', 'test')
    expect(written().currentStreak).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Generosity
// ---------------------------------------------------------------------------

describe('generosity rewards paying above the minimum', () => {
  it('is nil at exactly the R100 minimum', async () => {
    givenContributions(perfectHistory(6, 100))
    await recalculateOne('u1', 'test')
    expect(written().generosityScore).toBe(0)
  })

  it('rises with the average contribution', async () => {
    givenContributions(perfectHistory(6, 200))
    await recalculateOne('u1', 'test')
    expect(written().generosityScore).toBe(50)
    expect(written().avgContribution).toBe(200)
  })

  it('is capped, so no one can buy an unbounded score', async () => {
    givenContributions(perfectHistory(6, 100_000))
    await recalculateOne('u1', 'test')
    expect(written().generosityScore).toBe(100)
  })
})

// ---------------------------------------------------------------------------
// Promotion
// ---------------------------------------------------------------------------

describe('promotion', () => {
  it('records the move and tells the member on two channels', async () => {
    givenExistingScore({ currentBadge: 'SEMI_PRO', progressToNext: 50, graceUntil: null })
    givenContributions(perfectHistory(6))

    await recalculateOne('u1', 'monthly')

    expect(badgeRepo.createHistoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({ fromBadge: 'SEMI_PRO', toBadge: 'PRO', trigger: 'monthly' }),
    )
    const slugs = mock(queueNotification).mock.calls.map((c) => (c[0] as { templateSlug: string }).templateSlug)
    expect(slugs).toEqual(expect.arrayContaining(['badge-level-up', 'badge-level-up-email']))
  })

  it('holding the same tier is not a promotion and raises no notification', async () => {
    // Already past the nudge threshold, so nothing but a promotion could speak.
    givenExistingScore({ currentBadge: 'PRO', progressToNext: 95, graceUntil: null })
    givenContributions(perfectHistory(6))

    await recalculateOne('u1', 'monthly')

    expect(badgeRepo.createHistoryEntry).not.toHaveBeenCalled()
    expect(queueNotification).not.toHaveBeenCalled()
  })

  it('earning a tier back clears any grace period', async () => {
    givenExistingScore({ currentBadge: 'SEMI_PRO', progressToNext: 10, graceUntil: monthsAgo(-1) })
    givenContributions(perfectHistory(6))

    await recalculateOne('u1', 'monthly')

    expect(written().graceUntil).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Grace — a member who slips keeps their badge for sixty days.
// ---------------------------------------------------------------------------

describe('losing form does not take the badge away immediately', () => {
  it('keeps the current tier and opens a grace period instead', async () => {
    givenExistingScore({ currentBadge: 'WORLD_CLASS', progressToNext: 100, graceUntil: null })
    givenContributions(perfectHistory(3)) // only SEMI_PRO-worthy now

    const res = await recalculateOne('u1', 'monthly')

    expect(res.currentBadge).toBe('WORLD_CLASS')
    expect(res.eligibleTier).toBe('SEMI_PRO')
    expect(written().graceUntil).toBeInstanceOf(Date)
    expect(queueNotification).not.toHaveBeenCalled()
  })

  it('does not restart a grace period that is already running', async () => {
    const started = new Date('2026-07-01T00:00:00.000Z')
    givenExistingScore({ currentBadge: 'WORLD_CLASS', progressToNext: 100, graceUntil: started })
    givenContributions(perfectHistory(3))

    await recalculateOne('u1', 'monthly')

    expect(written().graceUntil).toEqual(started)
  })
})

describe('checkGraceExpiry', () => {
  it('demotes a member who never recovered, and tells them', async () => {
    mock(badgeRepo.findUsersInExpiredGrace).mockResolvedValue(
      [{ userId: 'u1', currentBadge: 'PRO' }] as never,
    )
    givenContributions(perfectHistory(3)) // SEMI_PRO-worthy

    const demoted = await checkGraceExpiry()

    expect(demoted).toBe(1)
    expect(badgeRepo.createHistoryEntry).toHaveBeenCalledWith(
      expect.objectContaining({ fromBadge: 'PRO', toBadge: 'SEMI_PRO', trigger: 'grace_expired' }),
    )
    expect(queueNotification).toHaveBeenCalledWith(
      expect.objectContaining({ templateSlug: 'badge-level-down' }),
    )
    expect(written().graceUntil).toBeNull()
  })

  it('keeps the tier of a member who recovered before the deadline', async () => {
    mock(badgeRepo.findUsersInExpiredGrace).mockResolvedValue(
      [{ userId: 'u1', currentBadge: 'PRO' }] as never,
    )
    givenContributions(perfectHistory(6)) // back to PRO

    const demoted = await checkGraceExpiry()

    expect(demoted).toBe(0)
    expect(badgeRepo.createHistoryEntry).not.toHaveBeenCalled()
    expect(queueNotification).not.toHaveBeenCalled()
    expect(written().graceUntil).toBeNull()
  })

  it('one member failing does not abandon the rest of the batch', async () => {
    mock(badgeRepo.findUsersInExpiredGrace).mockResolvedValue([
      { userId: 'bad', currentBadge: 'PRO' },
      { userId: 'u1',  currentBadge: 'PRO' },
    ] as never)
    mock(contributionRepo.findMany)
      .mockRejectedValueOnce(new Error('db blip') as never)
      .mockResolvedValue(perfectHistory(3) as never)

    expect(await checkGraceExpiry()).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// The nearly-there nudge
// ---------------------------------------------------------------------------

describe('the 80% nudge fires on the way past, not every time', () => {
  it('is sent when progress crosses the threshold', async () => {
    givenExistingScore({ currentBadge: 'PRO', progressToNext: 70, graceUntil: null })
    givenContributions(perfectHistory(11, 300))

    await recalculateOne('u1', 'monthly')

    const slugs = mock(queueNotification).mock.calls.map((c) => (c[0] as { templateSlug: string }).templateSlug)
    expect(slugs).toContain('badge-progress-80')
  })

  it('is not repeated once the member is already past it', async () => {
    givenExistingScore({ currentBadge: 'PRO', progressToNext: 95, graceUntil: null })
    givenContributions(perfectHistory(11, 300))

    await recalculateOne('u1', 'monthly')

    expect(queueNotification).not.toHaveBeenCalled()
  })

  it('is never sent to someone already at the top tier', async () => {
    givenExistingScore({ currentBadge: 'WORLD_CLASS', progressToNext: 0, graceUntil: null })
    givenContributions(perfectHistory(12))

    await recalculateOne('u1', 'monthly')

    const slugs = mock(queueNotification).mock.calls.map((c) => (c[0] as { templateSlug: string }).templateSlug)
    expect(slugs).not.toContain('badge-progress-80')
  })
})

// ---------------------------------------------------------------------------
// Batch
// ---------------------------------------------------------------------------

describe('recalculateAll', () => {
  it('processes every active member and reports the count', async () => {
    mock(badgeRepo.findAllActiveUserIds).mockResolvedValue(
      [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }] as never,
    )
    givenContributions(perfectHistory(3))

    expect(await recalculateAll('monthly')).toBe(3)
  })

  it('carries on when one member cannot be calculated', async () => {
    mock(badgeRepo.findAllActiveUserIds).mockResolvedValue([{ id: 'bad' }, { id: 'u2' }] as never)
    mock(contributionRepo.findMany)
      .mockRejectedValueOnce(new Error('db blip') as never)
      .mockResolvedValue(perfectHistory(3) as never)

    expect(await recalculateAll('monthly')).toBe(1)
  })
})
