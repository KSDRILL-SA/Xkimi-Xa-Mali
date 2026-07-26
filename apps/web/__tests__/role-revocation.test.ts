import { describe, it, expect } from 'vitest'
import { mustReauthenticate } from '@/lib/role-version-policy'

/**
 * Role revocation is the only thing that ends a session before its JWT expires.
 * A member suspended for fraud, or an admin who has been demoted, keeps every
 * power in their token until this says otherwise — for up to seven days.
 *
 * The bug these tests exist to prevent: the stored version used to carry a
 * 300-second expiry, and a missing key was read as version 0. Zero is never
 * greater than the version inside a token, so five minutes after a suspension
 * the comparison began reporting "not stale" and the revoked session worked
 * again. The member only had to wait it out.
 *
 * The fix has two halves — keys no longer expire (see lib/role-version.ts), and
 * "no answer" is no longer allowed to masquerade as "no change", which is what
 * this policy encodes.
 */

describe('a session known to be stale', () => {
  it('is always re-authenticated, whatever it can do', () => {
    expect(mustReauthenticate('stale', true)).toBe(true)
    expect(mustReauthenticate('stale', false)).toBe(true)
  })
})

describe('a session confirmed current', () => {
  it('is left alone', () => {
    expect(mustReauthenticate('fresh', true)).toBe(false)
    expect(mustReauthenticate('fresh', false)).toBe(false)
  })
})

describe('when freshness cannot be established', () => {
  // The case that matters. Redis unreachable, unconfigured, or the key gone —
  // all indistinguishable from here, and none of them evidence that the roles
  // are unchanged.
  it('does not treat "no answer" as "no change"', () => {
    expect(mustReauthenticate('unverifiable', true)).not.toBe(
      mustReauthenticate('fresh', true),
    )
  })

  it('fails CLOSED for an admin — they can reverse transactions and suspend members', () => {
    expect(mustReauthenticate('unverifiable', true)).toBe(true)
  })

  it('fails OPEN for a member, so a Redis blip is not a site-wide sign-out', () => {
    // Deliberate asymmetry. Failing closed for everyone turns a brief outage
    // into an availability incident caused by the security control itself,
    // for sessions whose worst case is reading their own balance.
    expect(mustReauthenticate('unverifiable', false)).toBe(false)
  })
})

describe('the guarantee, stated as a table', () => {
  const cases: Array<{
    verdict: 'fresh' | 'stale' | 'unverifiable'
    privileged: boolean
    reauth: boolean
  }> = [
    { verdict: 'fresh', privileged: false, reauth: false },
    { verdict: 'fresh', privileged: true, reauth: false },
    { verdict: 'stale', privileged: false, reauth: true },
    { verdict: 'stale', privileged: true, reauth: true },
    { verdict: 'unverifiable', privileged: false, reauth: false },
    { verdict: 'unverifiable', privileged: true, reauth: true },
  ]

  it.each(cases)('$verdict + privileged=$privileged -> reauth=$reauth', ({ verdict, privileged, reauth }) => {
    expect(mustReauthenticate(verdict, privileged)).toBe(reauth)
  })

  it('never lets a privileged session continue without a positive "fresh"', () => {
    // The invariant worth protecting: for an admin, only an affirmative
    // confirmation keeps the session alive. Anything else signs them out.
    for (const verdict of ['fresh', 'stale', 'unverifiable'] as const) {
      const allowed = !mustReauthenticate(verdict, true)
      expect(allowed, verdict).toBe(verdict === 'fresh')
    }
  })
})
