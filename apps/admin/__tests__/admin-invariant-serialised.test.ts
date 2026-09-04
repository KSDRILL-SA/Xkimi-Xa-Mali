import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// One invariant, four call sites, one lock.
//
// `role-policy` and `status-policy` already decide correctly *what* is allowed,
// and `role-change-guards.test.ts` holds the line that neither app keeps its own
// copy of the decision. This file holds the other half: *when* the decision is
// made.
//
// Every one of these did the same thing — count the admins, ask the policy,
// write — with nothing holding the three together, so two admins acting at once
// both read a safe number and both wrote. Two different operations can break
// this one invariant and they cannot see each other: revoking a role reads
// `user_roles`, suspending an account reads `users`.
//
// So the assertions below are about order and about the client used, because
// those are the two ways this regresses without anything looking wrong:
//
//   - a lock taken *after* the count locks nothing; the stale read has happened
//   - a count run on the module-level `db` instead of `tx` is outside the
//     transaction holding the lock, and is therefore not covered by it
//
// Read from source rather than exercised through mocks on purpose. A mocked
// Prisma client will happily accept a count on the wrong client and report
// success, which is exactly the failure being guarded against.
// ---------------------------------------------------------------------------

const read = (relative: string) => readFileSync(resolve(__dirname, relative), 'utf8')

/** The body of a named exported function, up to the next top-level export. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`)
  expect(start, `${name} not found`).toBeGreaterThan(-1)
  const rest = source.slice(start + 1)
  const end = rest.indexOf('\nexport ')
  return end === -1 ? rest : rest.slice(0, end)
}

/**
 * The four places that can reduce the number of admins able to sign in.
 *
 * `countPattern` is how each one asks the question — deliberately the real
 * expression from each file rather than something generic, so renaming the
 * query without moving the lock still fails here.
 */
const CALL_SITES = [
  {
    name: 'admin console — setMemberRole',
    file: '../lib/services/invitations.ts',
    fn: 'setMemberRole',
    countPattern: /tx\.userRole\.count\(/,
    staleCountPattern: /\bdb\.userRole\.count\(/,
  },
  {
    name: 'admin console — setMemberStatus',
    file: '../lib/services/members.ts',
    fn: 'setMemberStatus',
    countPattern: /tx\.user\.count\(/,
    staleCountPattern: /\bdb\.user\.count\(/,
  },
  {
    name: 'member app — setMemberRole',
    file: '../../web/services/invite.service.ts',
    fn: 'setMemberRole',
    countPattern: /countUserRoles\([^)]*,\s*tx\s*\)/,
    staleCountPattern: /countUserRoles\(\s*\{[^}]*\}\s*\)/,
  },
  {
    name: 'member app — setMemberStatus',
    file: '../../web/services/admin.service.ts',
    fn: 'setMemberStatus',
    countPattern: /countActiveAdmins\(\s*tx\s*\)/,
    staleCountPattern: /countActiveAdmins\(\s*\)/,
  },
] as const

describe('every path that can remove the last admin takes the lock', () => {
  it.each(CALL_SITES)('$name imports the shared lock', ({ file }) => {
    // Not its own copy. A second implementation of a lock is a second lock,
    // and two locks serialise nothing against each other.
    expect(read(file)).toContain("from '@xxm/utils/admin-invariant'")
  })

  it.each(CALL_SITES)('$name takes the lock before it counts', ({ file, fn, countPattern }) => {
    const body = functionBody(read(file), fn)

    const lockAt = body.indexOf('lockAdminInvariant(')
    expect(lockAt, 'lock is never taken').toBeGreaterThan(-1)

    const countAt = body.search(countPattern)
    expect(countAt, 'count not found — has the query been renamed?').toBeGreaterThan(-1)

    // The whole finding, in one comparison.
    expect(lockAt, 'the lock must precede the count, or the read is already stale')
      .toBeLessThan(countAt)
  })

  it.each(CALL_SITES)('$name counts inside the transaction', ({ file, fn, staleCountPattern }) => {
    // A count on the module-level client runs on its own connection, outside
    // the transaction holding the lock — so the lock is held and the number it
    // was taken to protect is read from somewhere it does not apply.
    const body = functionBody(read(file), fn)
    expect(body).not.toMatch(staleCountPattern)
  })

  it.each(CALL_SITES)('$name writes in the same transaction as it counted', ({ file, fn }) => {
    // Counting under the lock and then writing after the transaction commits
    // reopens exactly the gap the lock closed.
    const body = functionBody(read(file), fn)
    expect(body).toMatch(/\$transaction\(|runTransaction\(/)
  })
})

describe('the rule itself is still shared', () => {
  it('the member app consults status-policy, not a private opinion', () => {
    // This is the finding the audits did not reach. `status-policy` exists
    // because suspension could strand the circle exactly as role revocation
    // could, and the console was given the rule. The member app's copy —
    // reachable at POST /api/v1/admin/members/:id/status — was never given it
    // at all, so an admin could suspend the last remaining admin in a single
    // request, with no race involved.
    const web = read('../../web/services/admin.service.ts')

    expect(web).toContain('@xxm/utils/status-policy')
    expect(web).toContain('refuseStatusChange')
    // No locally restated threshold. One rule, or it is two rules that agree
    // until somebody edits one of them.
    expect(web).not.toMatch(/activeAdminCount\s*<=\s*1/)
  })

  it('neither app restates the admin-count threshold', () => {
    for (const { name, file } of CALL_SITES) {
      expect(read(file), name).not.toMatch(/adminCount\s*<=\s*1/)
    }
  })
})
