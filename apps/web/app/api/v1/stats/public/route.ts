import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cache } from '@/lib/cache'

const CACHE_KEY = 'xxm:cache:stats:public'
const CACHE_TTL = 3600

// Public — no auth required. Returns only aggregates, zero PII.
export async function GET() {
  const cached = await cache.get<object>(CACHE_KEY)
  if (cached) return NextResponse.json({ data: cached })

  const [memberCount, txAggregate, firstContribution] = await Promise.all([
    db.user.count({ where: { status: 'ACTIVE' } }),
    db.transaction.aggregate({
      where: { status: 'SUCCESS' },
      _sum: { amount: true },
    }),
    db.contribution.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
  ])

  const months = firstContribution?.createdAt
    ? Math.floor((Date.now() - firstContribution.createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30))
    : 0

  const stats = {
    members:      memberCount,
    totalPooled:  Number(txAggregate._sum.amount ?? 0),
    monthsActive: months,
  }

  await cache.set(CACHE_KEY, stats, CACHE_TTL)

  return NextResponse.json({ data: stats })
}
