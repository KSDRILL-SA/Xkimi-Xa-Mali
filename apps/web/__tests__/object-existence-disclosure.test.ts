import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { canAccess } from '@/lib/authorization'

// ---------------------------------------------------------------------------
// What a refusal is allowed to reveal.
//
// A service that loads by id, throws "not found" when the row is missing, and
// *then* asks whether the caller may see it has answered two questions:
//
//     404  ->  no such mandate
//     403  ->  that mandate exists, and it is somebody else's
//
// The second is a fact about another member that nobody agreed to share.
//
// The sharpest detail in the finding is that both patterns already lived in
// `mandate.service.ts`. Bank accounts — the most sensitive objects in the
// system — used the safe form (`findByIdAndUser`, one answer for both cases).
// Mandates, four times in the same file, used the leaky one. The safe pattern
// was written, in that file, by somebody who understood it. It simply was not
// applied uniformly, which is this codebase's signature failure and the reason
// this check is a test rather than a one-off reading.
//
// Read from source rather than exercised through mocks: what is being asserted
// is that no *future* site reintroduces the shape, and a mock can only speak
// for the paths somebody remembered to write a case for.
// ---------------------------------------------------------------------------

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8')

/**
 * The shape being banned: a not-found throw for a loaded row, immediately
 * followed by an authorisation check on that same row.
 *
 * Deliberately narrow. `assertCanAccess(userId, ...)` on a *parameter* is a
 * different thing and is already safe — it runs before any lookup, so a
 * stranger's id and a nonexistent one are refused identically. Only the
 * load-then-authorise ordering leaks.
 */
const LEAKY = /if \(![a-zA-Z]+\) throw new \w*NotFoundError\(\)\s*\n\s*assertCanAccess\(\w+\.userId/

/** Services holding objects a member cannot otherwise enumerate. */
const PRIVATE_OBJECT_SERVICES = [
  { name: 'mandates', file: '../services/mandate.service.ts' },
  { name: 'contributions', file: '../services/contribution.service.ts' },
  { name: 'members and bank accounts', file: '../services/member.service.ts' },
  { name: 'reports and statements', file: '../services/report.service.ts' },
  { name: 'goal payments', file: '../services/goal-payment.service.ts' },
  { name: 'goal plans', file: '../services/goal-plan.service.ts' },
  { name: 'budgets', file: '../services/budget.service.ts' },
  { name: 'insights', file: '../services/insights.service.ts' },
] as const

describe('an object you may not see is indistinguishable from one that is not there', () => {
  it.each(PRIVATE_OBJECT_SERVICES)('$name does not answer 404 and 403 differently', ({ file }) => {
    expect(read(file)).not.toMatch(LEAKY)
  })

  it('mandates ask the combined question, at every entry point', () => {
    // getMandate, updateMandate, cancelMandate, requestDelay. All four loaded
    // the row, threw not-found, then authorised.
    const src = read('../services/mandate.service.ts')

    const combined = src.match(/!mandate \|\| !canAccess\(mandate\.userId/g) ?? []
    expect(combined).toHaveLength(4)
  })

  it('contributions ask it too, on the by-id read', () => {
    const src = read('../services/contribution.service.ts')

    expect(src).toMatch(/!contribution \|\| !canAccess\(contribution\.userId/)
  })
})

describe('what deliberately still says "forbidden"', () => {
  // Not an oversight, and recorded here so a later sweep does not "fix" it.
  //
  // Every member can already see the community board and the comments under a
  // goal. Their existence is not a secret, so "not found" would be a lie about
  // something on the screen — and "you can only delete your own messages" is
  // both true and more useful than a 404 the member can see is wrong.
  //
  // The rule is about what a refusal *reveals*, not about which status code
  // looks stricter.

  it('community messages explain ownership rather than deny existence', () => {
    const src = read('../services/community.service.ts')
    expect(src).toContain('You can only delete your own messages')
  })

  it('goal comments do the same', () => {
    const src = read('../services/goal-engagement.service.ts')
    expect(src).toContain('You can only delete your own comments')
  })
})

describe('canAccess', () => {
  // The predicate behind both forms. `assertCanAccess` is now defined in terms
  // of it, so the two cannot drift into disagreeing about who may see what.

  it('lets a member reach their own object', () => {
    expect(canAccess('u1', 'u1', ['MEMBER'])).toBe(true)
  })

  it('refuses a member reaching somebody else’s', () => {
    expect(canAccess('u1', 'u2', ['MEMBER'])).toBe(false)
  })

  it('lets an admin reach anybody’s', () => {
    // Leadership has to be able to open a member's mandate to help them.
    expect(canAccess('u1', 'admin', ['ADMIN'])).toBe(true)
  })

  it('does not treat an empty role list as privileged', () => {
    expect(canAccess('u1', 'u2', [])).toBe(false)
  })

  it('is not fooled by a role that merely contains "ADMIN"', () => {
    // Exact membership, not a substring match.
    expect(canAccess('u1', 'u2', ['SUPERADMIN_PENDING'])).toBe(false)
  })
})
