import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { Redis } from '@upstash/redis'

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

export default auth(async (req) => {
  const { nextUrl, auth: session } = req

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

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!login$|login/|forbidden$|forbidden/|_next/static|_next/image|favicon.ico|api/auth).*)',
  ],
}
