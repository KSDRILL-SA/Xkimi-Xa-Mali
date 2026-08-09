import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The cache keys that were written and never cleared.
 *
 * `getGoals` keys its cache by *audience*, not by status: a member browsing
 * with no filter is cached under `goalsPage('public', ...)`, an admin under
 * `goalsPage('all', ...)`. The eviction sweep listed `all` and the four
 * `GoalStatus` values — and not `public`.
 *
 * So an admin activating a goal, changing a target or recording progress
 * cleared their own view and left **every member** looking at the old numbers
 * until the TTL expired. The gap was invisible precisely because the missing
 * keys belong to the people who do not do the writing.
 *
 * The dashboard's active-goals panel asks for `limit: 3`, which was not in the
 * swept limits either, so that panel was stale after any goal change too.
 */

const mocks = vi.hoisted(() => ({ del: vi.fn(), get: vi.fn(), set: vi.fn() }))

vi.mock('@/lib/env', () => ({ env: {} }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@xxm/observability', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/cache', () => ({
  cache: { del: mocks.del, get: mocks.get, set: mocks.set },
  CACHE_KEYS: {
    goalsPage: (status: string, page: number, limit: number) => `goals:${status}:${page}:${limit}`,
    GOALS_TTL: 300,
  },
}))
vi.mock('@/repositories/goal.repository', () => ({ goalRepo: { findMany: vi.fn(), count: vi.fn(), findById: vi.fn() } }))
vi.mock('@/repositories/contribution.repository', () => ({ contributionRepo: {} }))
vi.mock('@/repositories/transaction.repository', () => ({ transactionRepo: {}, SUCCESSFUL_INFLOW: {} }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/services/notification.service', () => ({ queueNotification: vi.fn() }))
vi.mock('@/services/ledger.service', () => ({ postPoolCredit: vi.fn(), postPoolDebit: vi.fn() }))

import { evictGoalsCache } from '@/services/goal.service'

/** Every key the sweep asked the cache to drop. */
async function sweptKeys(): Promise<string[]> {
  await evictGoalsCache()
  return mocks.del.mock.calls[0] as string[]
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.del.mockResolvedValue(undefined)
})

describe('what the sweep clears', () => {
  it("clears the member's unfiltered view, which it never used to", () => {
    // `goalsPage('public', ...)` is what every ordinary member reads. It was
    // written on every request and cleared by nothing.
    return sweptKeys().then((keys) => {
      expect(keys).toContain('goals:public:1:20')
    })
  })

  it("clears the dashboard panel's page size", async () => {
    // DashboardActiveGoals asks for three. The sweep knew about 20 and 50.
    const keys = await sweptKeys()
    expect(keys).toContain('goals:ACTIVE:1:3')
  })

  it("still clears the admin's unfiltered view", async () => {
    const keys = await sweptKeys()
    expect(keys).toContain('goals:all:1:20')
  })

  it('clears every status a caller can name', async () => {
    const keys = await sweptKeys()
    for (const status of ['DRAFT', 'ACTIVE', 'ACHIEVED', 'FAILED']) {
      expect(keys, status).toContain(`goals:${status}:1:20`)
    }
  })

  it('covers the first three pages of each', async () => {
    const keys = await sweptKeys()
    for (const page of [1, 2, 3]) {
      expect(keys, `page ${page}`).toContain(`goals:public:${page}:20`)
    }
  })
})

describe('the sweep covers every key the callers generate', () => {
  it('includes an entry for each audience and page size in combination', async () => {
    // The failure was a missing combination, not a missing concept, so the
    // assertion is on the product rather than on either list.
    const keys = await sweptKeys()
    const audiences = ['all', 'public', 'DRAFT', 'ACTIVE', 'ACHIEVED', 'FAILED']
    const limits = [3, 20, 50]

    for (const a of audiences) {
      for (const l of limits) {
        expect(keys, `${a} @ ${l}`).toContain(`goals:${a}:1:${l}`)
      }
    }
    expect(keys).toHaveLength(audiences.length * 3 * limits.length)
  })
})
