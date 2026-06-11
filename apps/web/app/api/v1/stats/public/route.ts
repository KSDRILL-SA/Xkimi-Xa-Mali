import { NextResponse } from 'next/server'
import { cache } from '@/lib/cache'
import { getPublicStats } from '@/services/stats.service'

const CACHE_KEY = 'xxm:cache:stats:public'
const CACHE_TTL = 3600

// Public — no auth required. Returns only aggregates, zero PII.
export async function GET() {
  const cached = await cache.get<object>(CACHE_KEY)
  if (cached) return NextResponse.json({ data: cached })

  const stats = await getPublicStats()
  await cache.set(CACHE_KEY, stats, CACHE_TTL)

  return NextResponse.json({ data: stats })
}
