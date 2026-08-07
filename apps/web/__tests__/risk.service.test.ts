import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    transaction: { findMany: vi.fn() },
    contribution: { groupBy: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import {
  assessFromCounts,
  assessMemberRisks,
  assessMemberRisk,
  needsUrgentWarning,
  needsHumanOutreach,
} from '@/services/risk.service'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>

const failures = (ids: string[]) =>
  mock(db.transaction.findMany).mockResolvedValue(ids.map((id) => ({ contribution: { userId: id } })) as never)

const overdue = (rows: Array<[string, number]>) =>
  mock(db.contribution.groupBy).mockResolvedValue(
    rows.map(([userId, n]) => ({ userId, _count: { _all: n } })) as never,
  )

beforeEach(() => {
  vi.clearAllMocks()
  failures([])
  overdue([])
})

// ---------------------------------------------------------------------------
// The tiering rule
// ---------------------------------------------------------------------------

describe('risk is a scale, not a flag', () => {
  it('a member with nothing against them is steady, and needs no explanation', () => {
    const risk = assessFromCounts('u1', 0, 0)
    expect(risk.tier).toBe('STEADY')
    expect(risk.reasons).toEqual([])
  })

  it('one declined debit is a wobble, not a crisis', () => {
    expect(assessFromCounts('u1', 1, 0).tier).toBe('WATCH')
  })

  it('one overdue contribution is a wobble too', () => {
    expect(assessFromCounts('u1', 0, 1).tier).toBe('WATCH')
  })

  it('two declines is a pattern', () => {
    expect(assessFromCounts('u1', 2, 0).tier).toBe('AT_RISK')
  })

  it('a decline AND an overdue together is a pattern, even though neither alone is', () => {
    // This is the case the old boolean could not see: two different kinds of
    // trouble at once say more than either on its own.
    expect(assessFromCounts('u1', 1, 1).tier).toBe('AT_RISK')
  })

  it('gets worse, not better, as signals pile up', () => {
    const tiers = [0, 1, 2, 5].map((n) => assessFromCounts('u1', n, 0).tier)
    expect(tiers).toEqual(['STEADY', 'WATCH', 'AT_RISK', 'AT_RISK'])
  })
})

describe('the reason is readable, because a flagged member deserves one', () => {
  it('describes a single decline', () => {
    expect(assessFromCounts('u1', 1, 0).reasons).toEqual(['a debit was declined recently'])
  })

  it('counts repeated declines and names the window', () => {
    expect(assessFromCounts('u1', 3, 0).reasons[0]).toBe('3 debits were declined in the last 90 days')
  })

  it('uses singular and plural correctly for overdue contributions', () => {
    expect(assessFromCounts('u1', 0, 1).reasons).toEqual(['one contribution is overdue'])
    expect(assessFromCounts('u1', 0, 2).reasons).toEqual(['2 contributions are overdue'])
  })

  it('gives both reasons when both apply', () => {
    expect(assessFromCounts('u1', 1, 2).reasons).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// What the tiers drive
// ---------------------------------------------------------------------------

describe('what each tier triggers', () => {
  it('leaves a steady member alone', () => {
    const risk = assessFromCounts('u1', 0, 0)
    expect(needsUrgentWarning(risk)).toBe(false)
    expect(needsHumanOutreach(risk)).toBe(false)
  })

  it('warns a wobbling member more firmly, without troubling anyone else', () => {
    const risk = assessFromCounts('u1', 1, 0)
    expect(needsUrgentWarning(risk)).toBe(true)
    expect(needsHumanOutreach(risk)).toBe(false)
  })

  it('brings a person in when the trouble is a pattern', () => {
    // The whole point: the system used to compute this, send one SMS, and tell
    // nobody who could actually help.
    const risk = assessFromCounts('u1', 2, 0)
    expect(needsUrgentWarning(risk)).toBe(true)
    expect(needsHumanOutreach(risk)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Batch assessment
// ---------------------------------------------------------------------------

describe('assessMemberRisks', () => {
  it('answers for a whole cohort in two queries, whatever its size', async () => {
    // A per-member round trip here would reintroduce the shape #253 removed.
    await assessMemberRisks(Array.from({ length: 500 }, (_, i) => `u${i}`))

    expect(db.transaction.findMany).toHaveBeenCalledTimes(1)
    expect(db.contribution.groupBy).toHaveBeenCalledTimes(1)
  })

  it('touches the database not at all for an empty cohort', async () => {
    expect((await assessMemberRisks([])).size).toBe(0)
    expect(db.transaction.findMany).not.toHaveBeenCalled()
  })

  it('tallies repeated failures for the same member', async () => {
    failures(['u1', 'u1', 'u1', 'u2'])

    const risks = await assessMemberRisks(['u1', 'u2'])

    expect(risks.get('u1')).toMatchObject({ recentFailures: 3, tier: 'AT_RISK' })
    expect(risks.get('u2')).toMatchObject({ recentFailures: 1, tier: 'WATCH' })
  })

  it('combines failures and overdue counts per member', async () => {
    failures(['u1'])
    overdue([['u1', 2], ['u3', 1]])

    const risks = await assessMemberRisks(['u1', 'u2', 'u3'])

    expect(risks.get('u1')).toMatchObject({ recentFailures: 1, overdueCount: 2, tier: 'AT_RISK' })
    expect(risks.get('u2')).toMatchObject({ recentFailures: 0, overdueCount: 0, tier: 'STEADY' })
    expect(risks.get('u3')).toMatchObject({ recentFailures: 0, overdueCount: 1, tier: 'WATCH' })
  })

  it('returns an entry for every member asked about, not only the troubled ones', async () => {
    const risks = await assessMemberRisks(['u1', 'u2', 'u3'])
    expect([...risks.keys()]).toEqual(['u1', 'u2', 'u3'])
  })

  it('only counts declines inside the lookback window', async () => {
    await assessMemberRisks(['u1'])

    const [arg] = mock(db.transaction.findMany).mock.calls[0] as unknown as [
      { where: { status: string; createdAt: { gte: Date } } },
    ]
    expect(arg.where.status).toBe('FAILED')
    const days = (Date.now() - arg.where.createdAt.gte.getTime()) / 86_400_000
    expect(Math.round(days)).toBe(90)
  })

  it('only counts contributions that are actually overdue', async () => {
    await assessMemberRisks(['u1'])
    const [arg] = mock(db.contribution.groupBy).mock.calls[0] as unknown as [
      { where: { status: string } },
    ]
    expect(arg.where.status).toBe('OVERDUE')
  })

  it('ignores a failure row whose contribution has gone', async () => {
    mock(db.transaction.findMany).mockResolvedValue([{ contribution: null }] as never)
    expect((await assessMemberRisks(['u1'])).get('u1')).toMatchObject({ recentFailures: 0, tier: 'STEADY' })
  })
})

describe('assessMemberRisk', () => {
  it('assesses one member', async () => {
    failures(['u1', 'u1'])
    expect(await assessMemberRisk('u1')).toMatchObject({ tier: 'AT_RISK', recentFailures: 2 })
  })

  it('reads as steady when there is nothing on record', async () => {
    expect(await assessMemberRisk('u-new')).toMatchObject({ tier: 'STEADY', reasons: [] })
  })
})
