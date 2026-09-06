import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// The console's Content-Security-Policy, and the auth boundary it moved.
//
// ── What was wrong ────────────────────────────────────────────────────────
//
// This app shipped `script-src 'self' 'unsafe-inline'` as a static header while
// the member app had already been moved to a per-request nonce. `unsafe-inline`
// is the directive that decides whether a policy stops an XSS or merely records
// that one happened — with it, an injected <script> runs like any other.
//
// So the weaker policy was on the app that reverses transactions, changes roles
// and suspends members, and the stronger one on the app that mostly reads. The
// same one-app-not-its-sibling drift that put the CSRF check and the Sentry
// connect-src fix in only one of the two.
//
// ── The part that needed care ─────────────────────────────────────────────
//
// A nonce cannot be a static header, so the policy had to move into middleware.
// But middleware only runs on matched paths, and this app's matcher EXCLUDED
// `/login` and `/forbidden` — the exclusion was doing double duty as the auth
// boundary. Leaving it would have left the login page, where an administrator
// types the credentials to an account that can move money, on the weak policy.
//
// So the matcher was broadened and the two public paths are now allowed by name
// inside the handler. That rewrites an auth boundary, and the previous author
// left a warning in the file saying not to do it in passing.
//
// These tests are that warning taken seriously: they assert the boundary is
// unchanged, in both directions, so the CSP fix cannot have quietly opened the
// console.
// ---------------------------------------------------------------------------

const SRC = readFileSync(path.resolve(__dirname, '../proxy.ts'), 'utf8')

/**
 * The file with its comments removed.
 *
 * Needed because `proxy.ts` explains the defect it was fixed for, and that
 * explanation contains the exact string this file forbids. A test in this
 * repository has matched its own comment twice before — passing or failing for
 * a reason invisible from the assertion — so it is stripped rather than hoped
 * about.
 */
const CODE = SRC
  .split(String.fromCharCode(10))
  .filter((l) => {
    const t = l.trimStart()
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
  })
  .join(String.fromCharCode(10))

/** The matcher regex, read out of the file rather than restated here. */
const matcher = (): RegExp => {
  const line = SRC.match(/matcher: \[[\s\S]*?'(\/\(\(\?![^']+)',/)
  if (!line?.[1]) throw new Error('could not find the matcher in proxy.ts')
  return new RegExp(`^${line[1]}$`)
}

/** Paths the handler lets through without a session, read out of the file. */
const publicPrefixes = (): string[] => {
  const block = SRC.match(/const PUBLIC_PREFIXES = \[([^\]]+)\]/)
  if (!block?.[1]) throw new Error('could not find PUBLIC_PREFIXES in proxy.ts')
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]!)
}

/** Reimplements `isPublicPath` so the assertion is about behaviour, not text. */
const isPublic = (pathname: string): boolean =>
  publicPrefixes().some((p) => pathname === p || pathname.startsWith(`${p}/`))

/**
 * Reachable without a session = middleware either skips the path entirely, or
 * runs and allows it through. Both together are the real boundary; before this
 * change the first did all the work, and now the second does.
 */
const reachableAnonymously = (pathname: string): boolean =>
  !matcher().test(pathname) || isPublic(pathname)

describe('the auth boundary did not move', () => {
  // Exactly what the old matcher allowed through unauthenticated. If any of
  // these stops being reachable, an administrator cannot sign in.
  const WAS_PUBLIC = [
    '/login',
    '/login/',
    '/login/reset',
    '/forbidden',
    '/forbidden/',
    '/_next/static/chunk.js',
    '/_next/image',
    '/favicon.ico',
    '/icon.svg',
    '/api/auth/session',
    '/api/auth/callback/credentials',
  ]

  it.each(WAS_PUBLIC)('%s is still reachable without a session', (p) => {
    expect(reachableAnonymously(p)).toBe(true)
  })

  // Everything that moves money, changes people, or reads member records. If
  // any of these becomes reachable, the console is open to the internet.
  const MUST_STAY_PROTECTED = [
    '/',
    '/dashboard',
    '/members',
    '/members/abc123',
    '/contributions',
    '/contributions/record',
    '/goals',
    '/ledger',
    '/reports',
    '/settings',
    '/invitations',
    '/api/export',
    '/api/export/pdf',
    '/api/media/proof',
    // Near-misses on the public prefixes. A prefix check written with
    // `startsWith(p)` instead of `startsWith(p + '/')` would let all of these
    // through, which is the classic way this kind of allowlist fails.
    '/loginx',
    '/login-as-someone-else',
    '/forbidden-zone',
    '/logins',
  ]

  it.each(MUST_STAY_PROTECTED)('%s still requires a session', (p) => {
    expect(reachableAnonymously(p)).toBe(false)
  })
})

describe('the policy itself', () => {
  it('carries a nonce and no longer blanket-allows inline scripts', () => {
    expect(CODE).toContain("script-src 'self' 'nonce-${nonce}'")
    // The exact string that made the old policy decorative. Asserted against
    // the code, not the file — the comment above it says these words.
    expect(CODE).not.toMatch(/script-src[^\n]*'unsafe-inline'/)
  })

  it('is set on every way out of the middleware', () => {
    // Five return points. A header set at four of them is a header that is
    // absent exactly when the fifth path is taken, which is the one nobody
    // tests by hand.
    expect(SRC).toContain("response.headers.set('Content-Security-Policy'")
    const returns = SRC.match(/return (NextResponse|passThrough)/g) ?? []
    expect(returns.length).toBeGreaterThanOrEqual(5)
  })

  it('forwards the nonce on the request so Next can stamp its own script', () => {
    // Without this Next emits its bootstrap unnonced, the browser refuses it,
    // and the console renders blank — the failure mode worth naming, because it
    // is total rather than subtle.
    expect(SRC).toContain("requestHeaders.set('x-nonce', nonce)")
    expect(SRC).toContain("requestHeaders.set('Content-Security-Policy'")
    expect(SRC).toContain('NextResponse.next({ request: { headers: requestHeaders } })')
  })

  it('keeps the directives that have no default-src fallback', () => {
    for (const directive of ["base-uri 'self'", "form-action 'self'", "object-src 'none'", "frame-ancestors 'none'"]) {
      expect(SRC).toContain(directive)
    }
  })

  it('still allows what this console actually needs', () => {
    // `data:` is the signature pad: SignaturePadCard fetches a data: URI to
    // turn a drawing into a Blob, and Chrome enforces connect-src against it.
    // Dropping it while tightening script-src would break signing, and the
    // symptom — "Failed to fetch" — points nowhere near the CSP.
    expect(SRC).toMatch(/connect-src 'self' data:/)
    expect(SRC).toContain('https://*.sentry.io')
  })

  it('is gone from next.config, so there is one policy and not two', () => {
    const config = readFileSync(path.resolve(__dirname, '../next.config.ts'), 'utf8')
    expect(config).not.toMatch(/key: 'Content-Security-Policy'/)
    // The other headers are static and belong there; only the CSP moved.
    expect(config).toContain("key: 'X-Frame-Options'")
  })
})

describe('the framework is not advertised', () => {
  it('X-Powered-By is off', () => {
    expect(readFileSync(path.resolve(__dirname, '../next.config.ts'), 'utf8'))
      .toContain('poweredByHeader: false')
  })
})
