import { describe, it, expect } from 'vitest'
import { mustReauthenticate, type RoleVersionVerdict } from '@/lib/role-version-policy'

/**
 * The rule that decides whether a session survives when its roles cannot be
 * confirmed. It is a security decision with an availability cost on the other
 * side of it, so both sides are pinned here rather than left to a comment.
 *
 * The case that brought this file into being: an admin signing in on a
 * deployment with no Redis configured. Sign-in succeeded, the next request
 * found the roles unverifiable, and the admin was handed back to the login page
 * holding a perfectly good session — permanently, because there was no cache
 * for a second sign-in to seed. The control denied service to every admin and
 * protected nothing, since with no cache there is no revocation to enforce.
 */

const PRIVILEGED = true
const ORDINARY = false

describe('a session whose roles are known to have changed', () => {
  it('is always re-established, privileged or not', () => {
    // The whole reason the version exists. A suspended member and a demoted
    // admin both keep a valid JWT until something notices.
    expect(mustReauthenticate('stale', PRIVILEGED)).toBe(true)
    expect(mustReauthenticate('stale', ORDINARY)).toBe(true)
  })
})

describe('a session whose roles are confirmed current', () => {
  it('is left alone', () => {
    expect(mustReauthenticate('fresh', PRIVILEGED)).toBe(false)
    expect(mustReauthenticate('fresh', ORDINARY)).toBe(false)
  })
})

describe('the cache exists and did not answer', () => {
  it('fails closed for an admin', () => {
    // An admin can approve mandates, reverse transactions and suspend members.
    // Continuing on roles that cannot be confirmed is the position an attacker
    // wants after an admin has been demoted.
    expect(mustReauthenticate('unverifiable', PRIVILEGED)).toBe(true)
  })

  it('fails open for a member', () => {
    // Failing closed for everybody turns a brief outage into a site-wide
    // sign-out — an availability incident caused by the security control.
    expect(mustReauthenticate('unverifiable', ORDINARY)).toBe(false)
  })
})

describe('there is no cache configured at all', () => {
  it('lets an admin through', () => {
    // This is the fix. Previously folded into 'unverifiable', which meant an
    // admin could not use the app at all on a deployment without Redis — and
    // could not sign their way out of it either, because there was no cache for
    // login to seed.
    expect(mustReauthenticate('unconfigured', PRIVILEGED)).toBe(false)
  })

  it('lets a member through', () => {
    expect(mustReauthenticate('unconfigured', ORDINARY)).toBe(false)
  })

  it('is a different verdict from a cache that did not answer', () => {
    // The two look identical from the middleware — no answer either way — and
    // that is exactly why they must not share one. One is an outage worth
    // failing closed over; the other is a deployment that does not run this
    // control, where failing closed protects nothing.
    expect(mustReauthenticate('unconfigured', PRIVILEGED))
      .not.toBe(mustReauthenticate('unverifiable', PRIVILEGED))
  })
})

describe('the shape of the decision', () => {
  it('never re-establishes a session on a verdict it does not recognise', () => {
    // Defensive: a verdict added later without a rule here should not silently
    // sign everybody out. It should be visible as a missing case instead.
    const unknown = 'something-new' as RoleVersionVerdict
    expect(mustReauthenticate(unknown, PRIVILEGED)).toBe(false)
  })

  it('only ever consults privilege for the one verdict that needs it', () => {
    // If privilege started mattering for 'fresh' or 'stale', the asymmetry
    // would have quietly spread beyond the case it was argued for.
    const verdicts: RoleVersionVerdict[] = ['fresh', 'stale', 'unconfigured']
    for (const v of verdicts) {
      expect(mustReauthenticate(v, PRIVILEGED)).toBe(mustReauthenticate(v, ORDINARY))
    }
  })
})
