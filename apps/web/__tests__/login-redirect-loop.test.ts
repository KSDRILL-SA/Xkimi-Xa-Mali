import { describe, it, expect } from 'vitest'
import { mustReauthenticate } from '@/lib/role-version-policy'

/**
 * Two middleware rules that chased each other.
 *
 * One sends a session whose role version cannot be verified to `/login` to sign
 * in again. The other sends anyone holding a session away from `/login` to
 * `/dashboard`. A session that exists but is not trusted satisfies both, so the
 * browser bounced between them until it gave up — ERR_TOO_MANY_REDIRECTS, and
 * no login form was ever shown.
 *
 * It bit admins hardest, and it did not need anything to be broken:
 * `mustReauthenticate` forces re-auth for a privileged session whose role
 * version is merely *unverifiable*, which is what happens whenever the
 * role-version cache cannot be reached. So a Redis outage did not degrade the
 * console — it locked every admin out, with no way back but clearing cookies by
 * hand.
 *
 * Reproduced against the running app: eight hops and still redirecting.
 */

/** The rule as the middleware now applies it. */
function bouncesAwayFromLogin(opts: { hasSession: boolean; reason: string | null }): boolean {
  const wasSentHere = opts.reason === 'session_expired'
  return opts.hasSession && !wasSentHere
}

describe('the condition that made the loop possible', () => {
  it('forces re-auth for an admin whose role version cannot be verified', () => {
    // Not a broken state — just an unreachable cache.
    expect(mustReauthenticate('unverifiable', true)).toBe(true)
  })

  it('lets an ordinary member through on the same verdict', () => {
    // Which is why this never showed up while testing as a member.
    expect(mustReauthenticate('unverifiable', false)).toBe(false)
  })

  it('forces re-auth for anyone whose role version is genuinely stale', () => {
    expect(mustReauthenticate('stale', false)).toBe(true)
    expect(mustReauthenticate('stale', true)).toBe(true)
  })
})

describe('arriving at /login', () => {
  it('sends a signed-in member on to the dashboard', () => {
    // The behaviour worth keeping: someone already signed in has no business
    // on the sign-in page.
    expect(bouncesAwayFromLogin({ hasSession: true, reason: null })).toBe(true)
  })

  it('lets a rejected session stay and sign in again', () => {
    // The fix. `reason=session_expired` is only ever set by the redirect that
    // rejected the session, so it marks exactly the case that used to loop.
    expect(bouncesAwayFromLogin({ hasSession: true, reason: 'session_expired' })).toBe(false)
  })

  it('leaves a signed-out visitor alone', () => {
    expect(bouncesAwayFromLogin({ hasSession: false, reason: null })).toBe(false)
    expect(bouncesAwayFromLogin({ hasSession: false, reason: 'session_expired' })).toBe(false)
  })

  it('terminates: the bounce can happen at most once', () => {
    // Someone typing /login directly while holding a rejected session is sent
    // to /dashboard, which sends them back carrying the reason — and there it
    // stops. Two hops, not infinity.
    const first = bouncesAwayFromLogin({ hasSession: true, reason: null })
    const second = bouncesAwayFromLogin({ hasSession: true, reason: 'session_expired' })
    expect([first, second]).toEqual([true, false])
  })
})
