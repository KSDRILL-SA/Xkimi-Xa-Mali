import { NextRequest, NextResponse } from 'next/server'
import { cache } from '@/lib/cache'
import { publicStatsRatelimit } from '@/lib/redis'
import { getClientIP } from '@/lib/request'
import { withApiHandler } from '@/lib/api-handler'
import { getPublicStats, type PublicStats } from '@/services/stats.service'

const CACHE_KEY = 'xxm:cache:stats:public'
const CACHE_TTL = 3600

/**
 * A per-instance copy of the last answer, held in memory.
 *
 * This exists because the Redis-backed protections all fail in the same
 * direction at the same time. When `UPSTASH_REDIS_REST_URL` is absent,
 * `cache.get` returns null on every call *and* `makeRatelimit` hands back a
 * no-op limiter that always allows. So the deployment with no Redis has no
 * cache and no throttle — the endpoint is completely unprotected in precisely
 * the state where each request is most expensive.
 *
 * A rate limit alone does not close that, which is worth stating plainly
 * because it is easy to believe it does: the limiter is one of the things that
 * disappears. This memo is the floor underneath it. It needs no configuration,
 * cannot be switched off, and bounds the database to one read per hour per
 * instance no matter what else is missing.
 *
 * It is not a replacement for Redis. Redis is shared across instances and this
 * is not, so with several instances running there is one read each rather than
 * one in total. That is the correct trade: the point is a bound that holds when
 * nothing else does, not the tightest possible bound.
 */
let memo: { data: PublicStats; expiresAt: number } | null = null

/**
 * Public — no auth required. Returns only aggregates, zero PII.
 *
 * This is the only unauthenticated endpoint in the system that reads the
 * database on demand, and it was a bare `export async function GET()` with none
 * of the protections every other route gets from `withApiHandler`: no rate
 * limit, no error shape, no trace id. Twelve unauthenticated requests in a row
 * returned twelve 200s.
 *
 * The limiter is named here rather than inherited because `withApiHandler`
 * throttles only state-changing methods — right for authenticated reads, wrong
 * for a route anyone can call.
 *
 * What has not changed, and must not: this returns aggregates only. A count, a
 * sum, and a month count. No row, no name, no amount attributable to anyone.
 */
export const GET = withApiHandler(async (req: NextRequest) => {
  const ip = getClientIP(req) ?? 'unknown'
  const { success } = await publicStatsRatelimit.limit(ip)

  if (!success) {
    return NextResponse.json(
      { error: { code: 'SYS_005', message: 'Too many requests. Please try again shortly.' } },
      { status: 429 },
    )
  }

  // Checked before Redis: it is a memory read, and it is the only layer that
  // still exists when Redis does not.
  if (memo && memo.expiresAt > Date.now()) {
    return NextResponse.json({ data: memo.data })
  }

  const cached = await cache.get<PublicStats>(CACHE_KEY)
  if (cached) {
    memo = { data: cached, expiresAt: Date.now() + CACHE_TTL * 1000 }
    return NextResponse.json({ data: cached })
  }

  const stats = await getPublicStats()
  memo = { data: stats, expiresAt: Date.now() + CACHE_TTL * 1000 }
  await cache.set(CACHE_KEY, stats, CACHE_TTL)

  return NextResponse.json({ data: stats })
})
