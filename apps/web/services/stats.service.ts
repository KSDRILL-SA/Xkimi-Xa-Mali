import { db } from '@/lib/db'

export type PublicStats = {
  members: number
  totalPooled: number
  monthsActive: number
}

/**
 * Public, aggregate-only platform stats — zero PII. Active member count,
 * total successfully-pooled rands, and months since the first contribution.
 * Caching is the caller's concern.
 */
export async function getPublicStats(): Promise<PublicStats> {
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

  return {
    members: memberCount,
    totalPooled: Number(txAggregate._sum.amount ?? 0),
    monthsActive: months,
  }
}
