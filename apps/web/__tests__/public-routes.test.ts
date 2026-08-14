import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

/**
 * The pages the law requires to be reachable without signing in.
 *
 * `/paia` shipped behind the session check. PAIA section 51 requires a private
 * body to compile a manual and make it **available on its website**, and the
 * page's own note says so — but the middleware's rule is "all other routes
 * require a session", so an anonymous visitor was redirected to `/login` and the
 * compliance register recorded the obligation as met. Nothing looked wrong from
 * the inside, because everyone who checked was signed in.
 *
 * The same trap catches every route added for someone who cannot authenticate:
 * a former member, an invitee who never joined, a regulator, an auditor.
 *
 * This reads the middleware source rather than exercising the middleware. That
 * is a deliberate trade: importing it pulls in next-auth and the whole edge
 * runtime, and what actually goes wrong here is not the logic — it is a path
 * being absent from a list. A source check catches exactly that, and catches it
 * on the commit that adds the page rather than on the complaint that follows.
 */

const SOURCE = readFileSync(path.resolve(__dirname, '..', 'middleware.ts'), 'utf8')

/** Everything before `if (isPublicPage || isPublicApi)` — the two allowlists. */
const ALLOWLIST = SOURCE.slice(0, SOURCE.indexOf('if (isPublicPage || isPublicApi)'))

const MUST_BE_PUBLIC: Array<[route: string, why: string]> = [
  ['/paia', 'PAIA s51 — the manual must be available on the website to anyone'],
  ['/privacy', 'POPIA — the processing notice is for people deciding whether to join'],
  ['/privacy/request', 'POPIA — a former member or an invitee cannot sign in to exercise a right'],
  ['/terms', 'The terms bind people who have not yet registered'],
  ['/support', 'The Information Officer is reached here; a locked-out member needs it'],
]

const MUST_BE_PUBLIC_API: Array<[route: string, why: string]> = [
  ['/api/v1/data-requests', 'The endpoint behind the public data request form'],
]

describe('routes that must not require a session', () => {
  for (const [route, why] of [...MUST_BE_PUBLIC, ...MUST_BE_PUBLIC_API]) {
    it(`${route} is in the public allowlist — ${why}`, () => {
      expect(ALLOWLIST).toContain(`pathname === '${route}'`)
    })
  }

  it('the allowlist section was actually found', () => {
    // Guards the test itself: if the middleware is restructured so the marker
    // disappears, ALLOWLIST becomes the whole file and every assertion above
    // passes for the wrong reason.
    expect(SOURCE).toContain('if (isPublicPage || isPublicApi)')
    expect(ALLOWLIST.length).toBeGreaterThan(0)
    expect(ALLOWLIST.length).toBeLessThan(SOURCE.length)
  })

  it('still defaults everything else to requiring a session', () => {
    // The rule that makes the omission dangerous in the first place. If this
    // ever stops being true, the allowlist stops being load-bearing and these
    // tests stop meaning anything.
    expect(SOURCE).toContain('All other routes require a session')
  })
})
