import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { verifyCsrfOrigin } from '@xxm/utils/csrf-origin'
import { getCachedRoleVersion, setCachedRoleVersion } from '@/lib/role-version-cache'
import { mustReauthenticate, type RoleVersionVerdict } from '@/lib/role-version-policy'
import { NextResponse } from 'next/server'
import { refuseForStanding, standingRefusalMessage } from '@xxm/utils/membership-standing'
import { Redis } from '@upstash/redis'

// Built from the Edge-safe config slice only — importing the full @/lib/auth
// here would drag PrismaClient (and its Node.js-only APIs) into the Edge
// Runtime middleware bundle, where it doesn't run.
const { auth } = NextAuth(authConfig)

const WEBHOOK_PREFIX = '/api/v1/webhooks'
const HEALTH_PATH = '/api/v1/health'
const AUTH_PREFIX = '/api/auth'

const ROLE_VERSION_PREFIX = 'xxm:role-version:'
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const REDIS_CONFIGURED = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)

let warnedUnconfigured = false
function warnUnconfiguredOnce(): void {
  if (warnedUnconfigured) return
  warnedUnconfigured = true
  console.warn(
    '[auth] no role-version cache configured — role and status changes will not ' +
    'take effect until a session expires. Set UPSTASH_REDIS_REST_URL and ' +
    'UPSTASH_REDIS_REST_TOKEN to enforce them immediately.',
  )
}

function getRedisClient(): Redis | null {
  if (!REDIS_CONFIGURED) return null
  return getRedis()
}

// Constant-time string comparison for the shared admin secret. node:crypto's
// timingSafeEqual is unavailable in the Edge runtime, so compare manually — a
// plain === leaks the secret through response timing. Length is compared first
// (only reveals length); equal-length inputs are compared in constant time.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

let _redis: Redis | null = null
function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  }
  return _redis
}

/**
 * Whether the session's roles are out of date and it must be re-established.
 *
 * This is the only thing standing between a suspended member and the rest of
 * their JWT's lifetime, so the failure modes matter as much as the happy path.
 *
 * Redis is the only store reachable from here — the Edge runtime cannot load
 * Prisma — which means "cannot reach Redis" and "role has not changed" are
 * genuinely indistinguishable at this layer. Rather than pick one answer for
 * everybody, the caller is told which case it is and decides based on what the
 * session can do: a member reading their balance is not the same risk as an
 * admin who can reverse a transaction.
 */
async function checkRoleVersion(userId: string, tokenVersion: number): Promise<RoleVersionVerdict> {
  // No cache configured is not the same as a cache that did not answer. The
  // first means this deployment does not operate the control at all; the
  // second means it does and is having a bad minute. They had the same verdict,
  // and admins were locked out of deployments that never had Redis.
  if (!REDIS_CONFIGURED) return 'unconfigured'

  const redisClient = getRedisClient()
  if (!redisClient) return 'unverifiable'

  // Check the in-process cache first — avoids a Redis round-trip on every
  // request for the common case where the role hasn't changed.
  const inProcess = getCachedRoleVersion(userId)
  if (inProcess !== null) {
    return inProcess > tokenVersion ? 'stale' : 'fresh'
  }

  try {
    const stored = await redisClient.get<string>(`${ROLE_VERSION_PREFIX}${userId}`)

    // A missing key is NOT "version 0". Keys are written without expiry and
    // seeded at login, so absence means eviction or data loss — not that the
    // role was never changed. Reading it as 0 is what previously let a
    // revocation lapse: 0 is never greater than the version in the token, so
    // once the old 300-second TTL expired the session quietly came back to life.
    if (stored === null) return 'unverifiable'

    const version = Number(stored)
    if (!Number.isFinite(version)) return 'unverifiable'

    setCachedRoleVersion(userId, version)
    return version > tokenVersion ? 'stale' : 'fresh'
  } catch {
    return 'unverifiable'
  }
}

/**
 * The Content-Security-Policy, built fresh per request around a one-time nonce.
 *
 * It lives here rather than in next.config because a nonce cannot be static.
 * The policy previously carried `script-src 'unsafe-inline'`, which is the one
 * directive that decides whether a CSP stops an XSS or merely documents that
 * one happened: with it, an injected `<script>` executes like any other. Next
 * needs *some* way to run its own inline bootstrap, and a per-request nonce is
 * the only alternative to blanket-allowing every inline script.
 *
 * The nonce also causes browsers to ignore `'unsafe-inline'` entirely, so the
 * keyword is simply gone rather than overridden.
 *
 * Cost, stated plainly: a per-request value means these pages can no longer be
 * prerendered at build time. Thirteen public pages move from static to dynamic.
 * That is a real price, and a small one against an app that moves money.
 */
function buildCsp(nonce: string): string {
  const dev = process.env.NODE_ENV === 'development'
  return [
    "default-src 'self'",
    // base-uri and form-action have NO default-src fallback — without them a
    // <base> injection could hijack relative URLs and forms could post to
    // arbitrary origins. Lock both to same-origin.
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    // 'unsafe-eval' stays development-only: the dev bundler needs it, and it is
    // never worth shipping.
    `script-src 'self' 'nonce-${nonce}' https://browser.sentry-cdn.com${dev ? " 'unsafe-eval'" : ''}`,
    // Styles keep 'unsafe-inline'. Next and Tailwind emit inline style
    // attributes that no nonce can cover, and an injected stylesheet cannot
    // execute — the exposure is defacement and data inference, not code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
    "font-src 'self'",
    // `https://o*.ingest.sentry.io` was here and is not valid CSP: a wildcard
    // must be a whole leftmost label, not a partial one. Browsers discarded the
    // source outright — "contains an invalid source ... It will be ignored" —
    // so Sentry's ingest host was not in connect-src at all and every
    // client-side error report was blocked by our own policy. Error reporting
    // looked configured and delivered nothing.
    //
    // `*.sentry.io` rather than a list, because the ingest host carries the org
    // id and the region (`o123.ingest.sentry.io`, `o123.ingest.us.sentry.io`),
    // so an exact list breaks the day the DSN moves region.
    "connect-src 'self' https://*.vercel.app https://*.upstash.io https://*.sentry.io https://*.public.blob.vercel-storage.com https://api.inngest.com",
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
  ].join('; ')
}

export default auth(async (req) => {
  const nonceCtx = { value: '' }
  const response = await handleRequest(req, nonceCtx)
  // Set once, on every path out. Eleven return points is ten too many places to
  // remember a security header.
  response.headers.set('Content-Security-Policy', buildCsp(nonceCtx.value))
  return response
})

async function handleRequest(
  req: Parameters<Parameters<typeof auth>[0]>[0],
  nonceCtx: { value: string },
): Promise<NextResponse> {
  const { pathname } = req.nextUrl
  const traceId = req.headers.get('x-trace-id') ?? crypto.randomUUID()

  const nonce = crypto.randomUUID().replace(/-/g, '')
  nonceCtx.value = nonce
  const csp = buildCsp(nonce)

  // Next reads the nonce off the *request* CSP header to stamp its own inline
  // bootstrap script. Both headers have to be forwarded, and only on responses
  // that will actually render React — a redirect or a JSON error has no
  // document to nonce.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  const passThrough = () => NextResponse.next({ request: { headers: requestHeaders } })

  // Always allow: health, webhooks (self-verifying), NextAuth internals, SW + offline
  if (
    pathname === HEALTH_PATH ||
    pathname === '/offline' ||
    pathname === '/sw.js' ||
    pathname.startsWith(WEBHOOK_PREFIX) ||
    pathname.startsWith(AUTH_PREFIX)
  ) {
    return passThrough()
  }

  const session = req.auth

  // Public routes — no session required
  const isPublicPage =
    pathname === '/' ||
    pathname === '/about' ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/support' ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password' ||
    pathname === '/verify-email' ||
    pathname.startsWith('/invite/')

  const isPublicApi =
    pathname === '/api/v1/stats/public' ||
    pathname === '/api/v1/auth/register' ||
    pathname === '/api/v1/auth/forgot-password' ||
    pathname === '/api/v1/auth/reset-password' ||
    pathname === '/api/v1/auth/verify-email' ||
    // Reachable without a session by necessity: the people who need it are the
    // ones who cannot sign in.
    pathname === '/api/v1/auth/resend-verification' ||
    pathname === '/api/v1/auth/invitations/validate'

  if (isPublicPage || isPublicApi) {
    // Someone already signed in has no business on the sign-in pages — unless
    // they were just sent here *because* their session was rejected.
    //
    // Without that exception the two rules chase each other. The check further
    // down sends a session it cannot verify to `/login`; this one sends anyone
    // holding a session back to `/dashboard`. A session that exists but is not
    // trusted satisfies both, and the browser bounces until it gives up with
    // ERR_TOO_MANY_REDIRECTS, never showing a login form.
    //
    // It bit admins hardest: `mustReauthenticate` forces re-auth for a
    // privileged session whose role version is merely *unverifiable*, which is
    // what happens whenever the role-version cache cannot be reached. A Redis
    // outage therefore did not degrade the console, it locked every admin into
    // a loop with no way out but clearing cookies by hand.
    //
    // Clearing the cookie here instead does not work: `auth()` rolls the
    // session cookie onto the response after the middleware body returns, so
    // its `Set-Cookie` lands after ours and the session survives.
    const wasSentHere = req.nextUrl.searchParams.get('reason') === 'session_expired'
    if (session && !wasSentHere && (pathname === '/login' || pathname === '/register' || pathname === '/forgot-password')) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return passThrough()
  }

  // Trusted internal calls from admin app — bypass session and CSRF checks
  if (pathname.startsWith('/api/v1/admin')) {
    const expectedSecret = process.env.ADMIN_API_SECRET
    const providedSecret = req.headers.get('x-admin-secret')
    if (expectedSecret && providedSecret && constantTimeEqual(providedSecret, expectedSecret)) {
      const response = passThrough()
      response.headers.set('x-trace-id', traceId)
      return response
    }
  }

  // All other routes require a session
  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'SYS_002', message: 'Unauthorised', traceId } },
        { status: 401, headers: { 'x-trace-id': traceId } },
      )
    }
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname + req.nextUrl.search)
    return NextResponse.redirect(loginUrl)
  }

  // Role version check — force re-auth if roles/status changed since JWT was issued
  const tokenVersion = (session.user as { roleVersion?: number }).roleVersion ?? 0
  const sessionRoles = Array.isArray(session.user?.roles) ? (session.user.roles as string[]) : []
  const isPrivileged = sessionRoles.includes('ADMIN')

  const verdict = session.user?.id
    ? await checkRoleVersion(session.user.id, tokenVersion)
    : 'unverifiable'

  // Said once per process, not once per request: a deployment running without a
  // role-version cache should know that suspending an admin will not take
  // effect until their token expires.
  if (verdict === 'unconfigured') warnUnconfiguredOnce()

  const mustReauth = mustReauthenticate(verdict, isPrivileged)

  if (verdict === 'unverifiable' && isPrivileged) {
    console.warn('[auth] admin role version unverifiable — forcing re-auth', { traceId })
  }

  if (mustReauth) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'SYS_006', message: 'Session expired — please sign in again', traceId } },
        { status: 401, headers: { 'x-trace-id': traceId } },
      )
    }
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname + req.nextUrl.search)
    loginUrl.searchParams.set('reason', 'session_expired')
    return NextResponse.redirect(loginUrl)
  }

  // Somebody who has left keeps their history, not their participation.
  //
  // Sign-in lets a RESIGNED member through on purpose — the promise is "leave
  // at any time, with your history intact". But every member-facing service
  // gates on `assertCanAccess`, which asks whether the data is yours and never
  // whether you are still a member. So a resigned member could still pay a
  // contribution, set up a debit order, fund a goal, commit to a plan, propose,
  // cheer, comment and post to the circle.
  //
  // Enforced here rather than in each service because a per-service rule is one
  // somebody has to remember on a surface that grows, and it fails silently
  // when they do not. Reads are untouched; only state changes are gated, and
  // the few a departed member must still make are named in the policy.
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/v1/admin')) {
    const standing = (session.user as { status?: string }).status ?? 'ACTIVE'
    if (refuseForStanding(standing, req.method, pathname)) {
      return NextResponse.json(
        { error: { code: 'SYS_008', message: standingRefusalMessage(standing), traceId } },
        { status: 403, headers: { 'x-trace-id': traceId } },
      )
    }
  }

  // CSRF origin validation for all state-mutating requests on authenticated routes
  if (MUTATING_METHODS.has(req.method) && pathname.startsWith('/api/')) {
    if (!verifyCsrfOrigin(req)) {
      return NextResponse.json(
        { error: { code: 'SYS_007', message: 'Invalid request origin', traceId } },
        { status: 403, headers: { 'x-trace-id': traceId } },
      )
    }
  }

  // Admin API routes require ADMIN role
  if (pathname.startsWith('/api/v1/admin')) {
    const roles = Array.isArray(session.user?.roles) ? (session.user.roles as string[]) : []
    if (!roles.includes('ADMIN')) {
      return NextResponse.json(
        { error: { code: 'SYS_003', message: 'Forbidden', traceId } },
        { status: 403, headers: { 'x-trace-id': traceId } },
      )
    }
  }

  const response = passThrough()
  response.headers.set('x-trace-id', traceId)
  return response
}

export const config = {
  // Exclude Next internals and any static asset in /public. The trailing
  // `.*\.[^/]+$` skips every path ending in a file extension (images, scripts,
  // fonts, etc.) so public assets like /founders/*.png are served directly
  // instead of being redirected to /login. Protected routes (/dashboard, /api)
  // never end in an extension, so this does not weaken auth.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|sw\\.js|.*\\.[^/]+$).*)'],
}
