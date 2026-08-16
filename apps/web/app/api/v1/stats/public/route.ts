import { NextRequest, NextResponse } from 'next/server'
import { cache } from '@/lib/cache'
import { publicStatsRatelimit } from '@/lib/redis'
import { getClientIP } from '@/lib/request'
import { withApiHandler } from '@/lib/api-handler'
import { getPublicStats } from '@/services/stats.service'

const CACHE_KEY = 'xxm:cache:stats:public'
const CACHE_TTL = 3600

/**
 * Public — no auth required. Returns only aggregates, zero PII.
 *
 * This is the only unauthenticated endpoint in the system that reads the
 * database on demand, and until now it was a bare `export async function GET()`
 * with none of the protections every other route gets:
 *
 * - **No rate limit.** `withApiHandler` throttles only state-changing methods,
 *   which is right for authenticated reads and wrong here, so the limiter is
 *   named explicitly rather than inherited. A cache miss costs three queries; if
 *   Redis is unconfigured `cache.get` returns null forever and *every* request
 *   pays all three, which means the mitigation and the thing it mitigates fail
 *   together.
 * - **No error handling.** An exception escaped as an unshaped 500 with no
 *   trace id, on the one endpoint a stranger can reach.
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

  const cached = await cache.get<object>(CACHE_KEY)
  if (cached) return NextResponse.json({ data: cached })

  const stats = await getPublicStats()
  await cache.set(CACHE_KEY, stats, CACHE_TTL)

  return NextResponse.json({ data: stats })
})
