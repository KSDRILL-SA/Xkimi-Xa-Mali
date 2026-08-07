import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest'

/**
 * The admin console approves mandates, reverses transactions and suspends
 * members. Its session carried a `roleVersion` and the app even bumped that
 * version when suspending someone — but nothing ever read it back. Revoking
 * an admin's role therefore did not end their session here: they kept every
 * power in the token until it expired, up to a day later.
 *
 * The check reads the database rather than the token, so unlike the member
 * app's Edge middleware there is no "cannot tell" case to reason about — it
 * always gets a definite answer.
 */

vi.mock('@/lib/db', () => ({
  db: { user: { findUnique: vi.fn() } },
}))

vi.mock('@/lib/env', () => ({
  env: { UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined },
}))

vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { db } from '@/lib/db'
import { isSessionRoleStale, currentRoleVersion } from '@/lib/role-version'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>

beforeEach(() => vi.clearAllMocks())

function storedVersion(version: number | null) {
  mock(db.user.findUnique).mockResolvedValue(
    (version === null ? null : { roleVersion: version }) as never,
  )
}

describe('a session whose roles have since changed', () => {
  it('is stale when the stored version has moved ahead', async () => {
    storedVersion(5)
    expect(await isSessionRoleStale('u1', 4)).toBe(true)
  })

  it('is stale however far behind the token is', async () => {
    // Bumps accumulate: suspended, reinstated, demoted. Any gap must count.
    storedVersion(9)
    expect(await isSessionRoleStale('u1', 0)).toBe(true)
  })
})

describe('a session that is still current', () => {
  it('is not stale when the versions match', async () => {
    storedVersion(3)
    expect(await isSessionRoleStale('u1', 3)).toBe(false)
  })

  it('is not stale when nothing has ever been bumped', async () => {
    storedVersion(0)
    expect(await isSessionRoleStale('u1', 0)).toBe(false)
  })

  it('does not sign out a token that is somehow ahead of the store', async () => {
    // Only a version *ahead* of the token means revocation. Treating any
    // mismatch as stale would sign admins out on a replication lag.
    storedVersion(2)
    expect(await isSessionRoleStale('u1', 3)).toBe(false)
  })
})

describe('the database is the authority', () => {
  it('reads the database when Redis is not configured', async () => {
    storedVersion(7)
    expect(await currentRoleVersion('u1')).toBe(7)
    expect(db.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { roleVersion: true },
    })
  })

  it('treats a missing user as version 0 rather than throwing', async () => {
    storedVersion(null)
    expect(await currentRoleVersion('gone')).toBe(0)
  })

  it('never reports a session current without actually looking', async () => {
    // The failure this guards: the admin app used to answer this question by
    // reading the JWT, which cannot know about a revocation issued after it.
    storedVersion(4)
    await isSessionRoleStale('u1', 1)
    expect(db.user.findUnique).toHaveBeenCalledTimes(1)
  })
})
