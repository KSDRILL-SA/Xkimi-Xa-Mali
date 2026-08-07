import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

vi.mock('@/lib/env', () => ({
  env: { ENCRYPTION_KEY: '0'.repeat(64), NETCASH_API_URL: 'https://netcash.test' },
}))
vi.mock('@/lib/db', () => ({ db: { $queryRaw: vi.fn() } }))
vi.mock('@/lib/cache', () => ({ cache: { get: vi.fn(), set: vi.fn(), del: vi.fn() }, CACHE_KEYS: {} }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { db } from '@/lib/db'
import { findRemindedContributionIds, findNotifiedContributionIds } from '@/services/contribution.service'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>

beforeEach(() => {
  vi.clearAllMocks()
  mock(db.$queryRaw).mockResolvedValue([] as never)
})

describe('the early-payment reminder is throttled on evidence, not on a cache', () => {
  // The reminder used to be throttled with a Redis key. The cache client is a
  // no-op shim when Upstash is not configured and its get() always returns null,
  // so every run read "not reminded yet" and sent again — the same member got
  // the same SMS three days running, and the group paid for all three.
  it('asks the database, not the cache', async () => {
    await findRemindedContributionIds(['c1'])
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('returns the contributions that already have a reminder on record', async () => {
    mock(db.$queryRaw).mockResolvedValue([{ contributionId: 'c1' }, { contributionId: 'c3' }] as never)
    expect(await findRemindedContributionIds(['c1', 'c2', 'c3'])).toEqual(['c1', 'c3'])
  })

  it('returns nothing when none have been reminded, so all of them are sent', async () => {
    expect(await findRemindedContributionIds(['c1', 'c2'])).toEqual([])
  })

  it('touches the database not at all for an empty batch', async () => {
    expect(await findRemindedContributionIds([])).toEqual([])
    expect(db.$queryRaw).not.toHaveBeenCalled()
  })

  it('answers for the whole batch in one query, however large', async () => {
    // The job runs over everyone falling due that day; a lookup per contribution
    // would be the shape #253 removed from the nightly reconciliation.
    await findRemindedContributionIds(Array.from({ length: 400 }, (_, i) => `c${i}`))
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
  })
})

describe('findNotifiedContributionIds — a window for messages that repeat', () => {
  it('looks at all time when no window is given, for a once-ever message', async () => {
    await findNotifiedContributionIds('contribution-due-reminder', ['c1'])
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('honours a window, so an overdue member hears from us daily and not hourly', async () => {
    // A contribution stays overdue until it is paid. Without a window, a member
    // already behind on money would be sent the same SMS on every single run.
    const since = new Date(Date.now() - 86_400_000)
    await findNotifiedContributionIds('overdue-reminder', ['c1'], since)
    expect(db.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('returns what the database matched', async () => {
    mock(db.$queryRaw).mockResolvedValue([{ contributionId: 'c2' }] as never)
    expect(await findNotifiedContributionIds('overdue-reminder', ['c1', 'c2'])).toEqual(['c2'])
  })

  it('asks nothing for an empty batch', async () => {
    expect(await findNotifiedContributionIds('overdue-reminder', [])).toEqual([])
    expect(db.$queryRaw).not.toHaveBeenCalled()
  })
})
