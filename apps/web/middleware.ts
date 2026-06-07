import NextAuth from 'next-auth'
import { authConfig } from '@/lib/auth.config'
import { NextResponse } from 'next/server'
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

// Only talk to Upstash when it is actually configured. Without this guard the
// raw client is built with undefined url/token and every authenticated request
// pays a failed network round-trip (caught, but slow) — the dominant source of
// local navigation latency.
const REDIS_CONFIGURED = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)

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

async function isRoleVersionStale(userId: string, tokenVersion: number): Promise<boolean> {
  if (!REDIS_CONFIGURED) return false
  try {
    const cached = await getRedis().get<string>(`${ROLE_VERSION_PREFIX}${userId}`)
    if (cached === null) return false
    return Number(cached) > tokenVersion
  } catch {
    return false
  }
}

function verifyCsrfOrigin(req: { headers: Headers; nextUrl: URL }): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return false
  const allowed = process.env.NEXTAUTH_URL
  if (!allowed) return false
  try {
    return new URL(origin).origin === new URL(allowed).origin
  } catch {
    return false
  }
}

export default auth(async (req) => {
  const { pathname } = req.nextUrl
  const traceId = req.headers.get('x-trace-id') ?? crypto.randomUUID()

  // Always allow: health, webhooks (self-verifying), NextAuth internals, SW + offline
  if (
    pathname === HEALTH_PATH ||
    pathname === '/offline' ||
    pathname === '/sw.js' ||
    pathname.startsWith(WEBHOOK_PREFIX) ||
    pathname.startsWith(AUTH_PREFIX)
  ) {
    return NextResponse.next()
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
    pathname === '/api/v1/auth/invitations/validate'

  if (isPublicPage || isPublicApi) {
    if (session && (pathname === '/login' || pathname === '/register' || pathname === '/forgot-password')) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
    return NextResponse.next()
  }

  // Trusted internal calls from admin app — bypass session and CSRF checks
  if (pathname.startsWith('/api/v1/admin')) {
    const expectedSecret = process.env.ADMIN_API_SECRET
    if (expectedSecret && req.headers.get('x-admin-secret') === expectedSecret) {
      const response = NextResponse.next()
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
  if (session.user?.id && await isRoleVersionStale(session.user.id, tokenVersion)) {
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

  const response = NextResponse.next()
  response.headers.set('x-trace-id', traceId)
  return response
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|sw\\.js).*)'],
}
