import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

// `reconcileLedger` now checks the pool against its own rules and alerts when it
// is holding less than nothing, which pulls the alert service — and validated
// env — into this module's import graph. Neither belongs in a unit test of the
// ledger arithmetic.
vi.mock('@/services/alert.service', () => ({ raiseOperationalAlert: vi.fn().mockResolvedValue({}) }))
vi.mock('./alert.service', () => ({ raiseOperationalAlert: vi.fn().mockResolvedValue({}) }))
vi.mock('@/lib/env', () => ({ env: { ENCRYPTION_KEY: '0'.repeat(64), NEXTAUTH_URL: 'https://app.test' } }))

vi.mock('@/lib/db', () => ({
  db: {
    ledgerEntry: { groupBy: vi.fn(), count: vi.fn() },
    goal: { findMany: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import { getFundOverview, getMemberFundShare } from '@/services/ledger.service'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>

/** A ledger `groupBy` row, as Prisma returns it. */
const row = (refType: string, direction: 'CREDIT' | 'DEBIT', amount: number | null) => ({
  refType,
  direction,
  _sum: { amount },
})

beforeEach(() => {
  vi.clearAllMocks()
  mock(db.goal.findMany).mockResolvedValue([] as never)
  mock(db.ledgerEntry.count).mockResolvedValue(0 as never)
})

/**
 * The fund figures a member sees.
 *
 * Every one of these is money, on a page whose whole purpose is being believed,
 * so the arithmetic is pinned rather than assumed.
 */
describe('getFundOverview — the pool, split by where the money came from', () => {
  it('splits monthly contributions from goal payments', async () => {
    mock(db.ledgerEntry.groupBy).mockResolvedValue([
      row('TRANSACTION', 'CREDIT', 6000),
      row('GOAL_PAYMENT', 'CREDIT', 2000),
    ] as never)

    const fund = await getFundOverview()

    expect(fund.monthly.net).toBe(6000)
    expect(fund.goals.net).toBe(2000)
    expect(fund.balance).toBe(8000)
  })

  it('subtracts reversals from the source they belong to, not from the whole', async () => {
    // A reversed goal payment must not make monthly contributions look smaller.
    mock(db.ledgerEntry.groupBy).mockResolvedValue([
      row('TRANSACTION', 'CREDIT', 6000),
      row('GOAL_PAYMENT', 'CREDIT', 2000),
      row('GOAL_PAYMENT', 'DEBIT', 500),
    ] as never)

    const fund = await getFundOverview()

    expect(fund.monthly.net).toBe(6000)
    expect(fund.goals).toEqual({ credited: 2000, debited: 500, net: 1500 })
    expect(fund.balance).toBe(7500)
  })

  it('reports credited and debited separately so a reversal can be shown', async () => {
    // A total that quietly excludes a reversed payment leaves a member with no
    // way to understand why the number moved.
    mock(db.ledgerEntry.groupBy).mockResolvedValue([
      row('TRANSACTION', 'CREDIT', 1000),
      row('TRANSACTION', 'DEBIT', 250),
    ] as never)

    const fund = await getFundOverview()

    expect(fund.monthly.credited).toBe(1000)
    expect(fund.monthly.debited).toBe(250)
    expect(fund.monthly.net).toBe(750)
  })

  it('treats an empty pool as zero rather than NaN', async () => {
    mock(db.ledgerEntry.groupBy).mockResolvedValue([] as never)

    const fund = await getFundOverview()

    expect(fund.balance).toBe(0)
    expect(fund.monthly.net).toBe(0)
    expect(fund.goals.net).toBe(0)
  })

  it('survives a null sum on a group that exists', async () => {
    mock(db.ledgerEntry.groupBy).mockResolvedValue([
      row('TRANSACTION', 'CREDIT', null),
    ] as never)

    const fund = await getFundOverview()

    expect(fund.monthly.credited).toBe(0)
    expect(fund.balance).toBe(0)
  })

  it('lists goals that failed, because their money is still in the balance', async () => {
    mock(db.ledgerEntry.groupBy).mockResolvedValue([] as never)

    await getFundOverview()

    const where = mock(db.goal.findMany).mock.calls[0]![0] as {
      where: { status: { in: string[] } }
    }
    expect(where.where.status.in).toContain('FAILED')
    // Showing only healthy goals would print a headline the rows do not add
    // up to.
    expect(where.where.status.in).toEqual(
      expect.arrayContaining(['ACTIVE', 'ACHIEVED', 'FAILED']),
    )
  })

  it('does not count draft or rejected proposals as money', async () => {
    mock(db.ledgerEntry.groupBy).mockResolvedValue([] as never)

    await getFundOverview()

    const where = mock(db.goal.findMany).mock.calls[0]![0] as {
      where: { status: { in: string[] } }
    }
    expect(where.where.status.in).not.toContain('DRAFT')
    expect(where.where.status.in).not.toContain('REJECTED')
  })
})

describe('getMemberFundShare — the total that was missing', () => {
  it('adds goal payments to monthly contributions', async () => {
    // The bug this exists to fix: the dashboard summed Contribution.amountPaid
    // and called it "Total contributed", so R2 000 of goal money vanished.
    mock(db.ledgerEntry.groupBy).mockResolvedValue([
      row('TRANSACTION', 'CREDIT', 6000),
      row('GOAL_PAYMENT', 'CREDIT', 2000),
    ] as never)

    const share = await getMemberFundShare('user-1')

    expect(share).toEqual({ monthly: 6000, goals: 2000, total: 8000 })
  })

  it('is scoped to the member', async () => {
    mock(db.ledgerEntry.groupBy).mockResolvedValue([] as never)

    await getMemberFundShare('user-1')

    expect(db.ledgerEntry.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { account: 'POOL', memberId: 'user-1' } }),
    )
  })

  it('nets out a reversed contribution', async () => {
    mock(db.ledgerEntry.groupBy).mockResolvedValue([
      row('TRANSACTION', 'CREDIT', 1000),
      row('TRANSACTION', 'DEBIT', 100),
      row('GOAL_PAYMENT', 'CREDIT', 500),
    ] as never)

    const share = await getMemberFundShare('user-1')

    expect(share).toEqual({ monthly: 900, goals: 500, total: 1400 })
  })

  it('is zero for a member who has paid nothing', async () => {
    mock(db.ledgerEntry.groupBy).mockResolvedValue([] as never)

    const share = await getMemberFundShare('user-1')

    expect(share).toEqual({ monthly: 0, goals: 0, total: 0 })
  })
})

/**
 * The label that was wrong.
 *
 * `getMemberSummary().totalContributed` is monthly money only. Anywhere it is
 * rendered, the words next to it must not claim to be a member's whole
 * contribution — that claim now belongs to the fund page alone.
 */
describe('the monthly-only figure is not labelled as a total', () => {
  it('the dashboard calls it monthly contributions', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(
      resolve(__dirname, '../app/(member)/dashboard/_sections/DashboardStats.tsx'),
      'utf8',
    )

    expect(source).toContain('Monthly contributions')
    expect(source).not.toContain('label="Total contributed"')
  })

  it('the contributions hero calls it monthly contributions', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(
      resolve(__dirname, '../components/contribution/ContributionHero.tsx'),
      'utf8',
    )

    expect(source).toContain('Monthly contributions')
  })
})
