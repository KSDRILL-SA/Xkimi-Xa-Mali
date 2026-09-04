import { describe, it, expect, vi } from 'vitest'
import {
  lockAdminInvariant,
  ADMIN_INVARIANT_LOCK,
  XXM_LOCK_NAMESPACE,
} from '../admin-invariant'

// ---------------------------------------------------------------------------
// The lock that makes "at least one admin" an invariant.
//
// There is very little code here, and all of it is load-bearing: the SQL has to
// be the transaction-scoped form, it has to be parameterised rather than
// interpolated, and it has to be awaited. Each of those failing produces a
// system that looks correct and serialises nothing.
// ---------------------------------------------------------------------------

/** Records what was sent, the way Prisma's tagged-template client receives it. */
function fakeTx() {
  const calls: Array<{ sql: string; values: unknown[] }> = []
  return {
    calls,
    $executeRaw: vi.fn((query: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ sql: query.join('?'), values })
      return Promise.resolve(0)
    }),
  }
}

describe('lockAdminInvariant', () => {
  it('takes a transaction-scoped lock, not a session one', async () => {
    // `pg_advisory_lock` is held until explicitly released or the connection
    // closes. On a pooled connection that outlives the request, one failed
    // request would hold the admin invariant shut for every later one.
    const tx = fakeTx()

    await lockAdminInvariant(tx)

    expect(tx.calls[0]!.sql).toContain('pg_advisory_xact_lock')
    expect(tx.calls[0]!.sql).not.toContain('pg_advisory_lock(')
    expect(tx.calls[0]!.sql).not.toContain('try_advisory')
  })

  it('passes both keys as parameters rather than interpolating them', async () => {
    // The two-integer form, so no bigint cast is needed at the boundary.
    const tx = fakeTx()

    await lockAdminInvariant(tx)

    expect(tx.calls[0]!.values).toEqual([XXM_LOCK_NAMESPACE, ADMIN_INVARIANT_LOCK])
  })

  it('waits for the lock', async () => {
    // The whole point is that the second caller blocks until the first commits.
    // A missing await returns a pending promise and the count runs anyway.
    let released!: () => void
    const gate = new Promise<number>((resolve) => { released = () => resolve(0) })

    const tx = { $executeRaw: vi.fn(() => gate) }
    let settled = false
    const pending = lockAdminInvariant(tx).then(() => { settled = true })

    await Promise.resolve()
    expect(settled).toBe(false)

    released()
    await pending
    expect(settled).toBe(true)
  })

  it('keeps the two keys distinct so unrelated locks cannot collide', () => {
    // A namespace shared with an objid of the same value would make two
    // unrelated invariants serialise against each other, silently.
    expect(XXM_LOCK_NAMESPACE).not.toBe(ADMIN_INVARIANT_LOCK)
    expect(Number.isInteger(XXM_LOCK_NAMESPACE)).toBe(true)
    expect(Number.isInteger(ADMIN_INVARIANT_LOCK)).toBe(true)
    // int4 range — the two-argument form takes integers, and a value outside
    // it would be a runtime error on the first revocation anybody attempted.
    for (const key of [XXM_LOCK_NAMESPACE, ADMIN_INVARIANT_LOCK]) {
      expect(key).toBeGreaterThan(-2_147_483_648)
      expect(key).toBeLessThan(2_147_483_647)
    }
  })
})
