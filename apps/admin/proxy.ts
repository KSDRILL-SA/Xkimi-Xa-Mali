import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'
import { verifyCsrfOrigin } from '@xxm/utils/csrf-origin'

/**
 * Role revocation for page views.
 *
 * The roles on the session come from the JWT and describe what was true when it
 * was issued. Every mutating action is additionally gated by `requireAdmin`,
 * which re-checks against the database — but pages read data directly, so a
 * demoted admin would otherwise keep browsing member records, contributions and
 * the ledger until their token expired.
 *
 * This runs in the Edge runtime, which cannot load Prisma, so Redis is the only
 * store within reach and a definite answer is not always available:
 *
 * - **stale** — the stored version is ahead of the token. Sign them out.
 * - **unverifiable** — Redis unreachable, unconfigured, or the key gone. Allowed
 *   through, deliberately. Failing closed here would bounce every admin to a
 *   login page that also cannot reach Redis: a redirect loop during exactly the
 *   incident when someone needs the console. Nothing is waved through as a
 *   result — `requireAdmin` still blocks every action against the database,
 *   which does not depend on Redis being up.
 */

const ROLE_VERSION_PREFIX = 'xxm:role-version:'
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

const REDIS_CONFIGURED = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
)

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

async function isDefinitelyStale(userId: string, tokenVersion: number): Promise<boolean> {
  if (!REDIS_CONFIGURED) return false
  try {
    const stored = await getRedis().get<string>(`${ROLE_VERSION_PREFIX}${userId}`)
    if (stored === null || stored === undefined) return false
    const version = Number(stored)
    if (!Number.isFinite(version)) return false
    return version > tokenVersion
  } catch {
    return false
  }
}

/**
 * Pages this console serves without a session.
 *
 * These were previously excluded by the matcher, which kept middleware off them
 * entirely — and with it the Content-Security-Policy. The login page is where
 * an administrator types the credentials to an account that can move money, so
 * it is the last page that should carry the weaker policy.
 *
 * They are allowed here instead, by name. The authorisation outcome is
 * unchanged: exactly these paths are reachable without a session, exactly as
 * the old matcher allowed, and everything else still requires an ADMIN role.
 */
const PUBLIC_PREFIXES = ['/login', '/forbidden'] as const

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * The Content-Security-Policy, built fresh per request around a one-time nonce.
 *
 * A copy of the member app's `buildCsp` in shape and in reasoning, differing
 * only where this app genuinely differs — `connect-src` reaches the member app
 * for internal calls and allows `data:` for the signature pad.
 *
 * It lives here rather than in next.config because a nonce cannot be static.
 * The policy previously carried `script-src 'unsafe-inline'`, which is the one
 * directive deciding whether a CSP stops an XSS or merely documents that one
 * happened: with it, an injected <script> executes like any other. Next needs
 * some way to run its own inline bootstrap, and a per-request nonce is the only
 * alternative to blanket-allowing every inline script.
 *
 * Specifying a nonce also makes browsers ignore `'unsafe-inline'` outright, so
 * the keyword is gone rather than overridden.
 */
function buildCsp(nonce: string): string {
  const dev = process.env.NODE_ENV === 'development'
  return [
    "default-src 'self'",
    // No default-src fallback for either of these: without them a <base>
    // injection could hijack relative URLs and forms could post anywhere.
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    `script-src 'self' 'nonce-${nonce}' https://browser.sentry-cdn.com${dev ? " 'unsafe-eval'" : ''}`,
    // Styles keep 'unsafe-inline'. Next and Tailwind emit inline style
    // attributes no nonce can cover, and an injected stylesheet cannot execute
    // — the exposure is defacement, not code.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // `data:` is not a network origin — it is what SignaturePadCard.tsx
    // converts a drawn signature through before upload, and Chrome enforces
    // connect-src against a fetch() of a data: URI like any other. Removing it
    // breaks signatures. `*.sentry.io` because the ingest host carries the org
    // id and region, so a pinned host breaks when the DSN moves.
    `connect-src 'self' data: ${process.env.NEXT_PUBLIC_WEB_URL ?? 'https://member.xkimixamali.co.za'} https://*.sentry.io`,
    "frame-ancestors 'none'",
  ].join('; ')
}

export default auth(async (req) => {
  const nonceCtx = { value: '' }
  const response = await handleRequest(req, nonceCtx)
  // Set once, on every path out. Five return points is four too many places to
  // remember a security header.
  response.headers.set('Content-Security-Policy', buildCsp(nonceCtx.value))
  return response
})

async function handleRequest(
  req: Parameters<Parameters<typeof auth>[0]>[0],
  nonceCtx: { value: string },
): Promise<NextResponse> {
  const { nextUrl, auth: session } = req

  const nonce = crypto.randomUUID().replace(/-/g, '')
  nonceCtx.value = nonce

  // Next reads the nonce off the *request* CSP header to stamp its own inline
  // bootstrap script. Both headers are forwarded, and only on responses that
  // will actually render React — a redirect or a JSON error has no document to
  // nonce.
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', buildCsp(nonce))
  const passThrough = () => NextResponse.next({ request: { headers: requestHeaders } })

  // Login and /forbidden: no session, but still a real policy.
  if (isPublicPath(nextUrl.pathname)) return passThrough()

  if (!session?.user?.id) {
    const loginUrl = new URL('/login', nextUrl.origin)
    loginUrl.searchParams.set('callbackUrl', nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  const roles = (session.user.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) {
    return NextResponse.redirect(new URL('/forbidden', nextUrl.origin))
  }

  const tokenVersion = (session.user as { roleVersion?: number }).roleVersion ?? 0
  if (await isDefinitelyStale(session.user.id, tokenVersion)) {
    const loginUrl = new URL('/login', nextUrl.origin)
    loginUrl.searchParams.set('callbackUrl', nextUrl.pathname)
    loginUrl.searchParams.set('reason', 'session_expired')
    return NextResponse.redirect(loginUrl)
  }

  // Cross-origin state change, refused.
  //
  // The member app has done this since #266; this app never did, and it is the
  // one that approves mandates, reverses transactions and suspends members. An
  // admin with a live session who loads an attacker's page was one form post
  // away from any of those.
  //
  // Applies to every mutating request rather than only `/api/*`, because almost
  // nothing here is an API route — the console is server actions, which are
  // POSTs to the page's own URL. Restricting this to `/api/` as the member app
  // does would have covered the two export routes and none of the actions that
  // move money.
  if (MUTATING_METHODS.has(req.method) && !verifyCsrfOrigin(req)) {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }

  return passThrough()
}

export const config = {
  matcher: [
    // `login` and `forbidden` are no longer excluded here.
    //
    // Excluding them kept middleware — and therefore the Content-Security-Policy
    // — off the one page where an administrator types the credentials to an
    // account that can move money. They are allowed through by name inside
    // `handleRequest` instead, so the authorisation outcome is byte for byte
    // what it was: exactly those paths reachable without a session, everything
    // else requiring an ADMIN role. What changed is that they now get a nonce.
    //
    // Everything still excluded is a static asset that renders no document.
    // `icon.svg` sits beside `favicon.ico` for the same reason: Next serves the
    // app icon from that path, and without the exclusion the proxy redirects the
    // browser's favicon request to /login — so the one page where an
    // unauthenticated person actually looks at this app is the one page with no
    // icon. Listed explicitly rather than excluding every path with an
    // extension, which is what the member app does; broadening an auth matcher
    // is not a change to make in passing, and this one was made staring at the
    // allowlist that compensates for it.
    '/((?!_next/static|_next/image|favicon.ico|icon.svg|api/auth).*)',
  ],
}
