import { db } from '@/lib/db'
import { tallyBy } from '@/lib/aggregate'
import { assertCanAccess } from '@/lib/authorization'

export type InsightTone = 'positive' | 'neutral' | 'warning'

export type MemberInsight = {
  code: string
  tone: InsightTone
  title: string
  detail: string
}

export type MemberInsights = {
  forecast: {
    yearToDatePaid: number
    monthlyAmount: number
    remainingMonths: number
    projectedYearEnd: number
  }
  stats: {
    paidCount: number
    totalCount: number
    overdueCount: number
    onTimeRate: number
    atRisk: boolean
  }
  nextDebitDay: number | null
  insights: MemberInsight[]
}

function rands(n: number): string {
  return `R ${Math.round(n).toLocaleString('en-ZA')}`
}

/**
 * Member financial-health intelligence: a year-end forecast from current pace,
 * on-time consistency, and risk signals — turned into a few plain-language
 * nudges. All aggregation is DB-side and parallel.
 */
export async function getMemberInsights(
  userId: string,
  requesterId: string,
  roles: string[],
): Promise<MemberInsights> {
  assertCanAccess(userId, requesterId, roles)

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const remainingMonths = Math.max(0, 12 - month)
  const lookback = new Date(year, month - 2, 1) // ~start of last month

  const [ytdAgg, activeMandate, recentFailed, statusCounts] = await Promise.all([
    db.contribution.aggregate({ where: { userId, periodYear: year }, _sum: { amountPaid: true } }),
    db.paymentMandate.findFirst({ where: { userId, status: 'ACTIVE' }, select: { amount: true, debitDay: true } }),
    db.transaction.count({ where: { contribution: { userId }, status: 'FAILED', createdAt: { gte: lookback } } }),
    db.contribution.groupBy({ by: ['status'], where: { userId }, _count: { status: true } }),
  ])

  const yearToDatePaid = Number(ytdAgg._sum.amountPaid ?? 0)
  const monthlyAmount = activeMandate ? Number(activeMandate.amount) : 0
  const projectedYearEnd = yearToDatePaid + monthlyAmount * remainingMonths

  const counts = tallyBy(statusCounts, (r) => r.status, 'status')
  const paidCount = counts['PAID'] ?? 0
  const overdueCount = counts['OVERDUE'] ?? 0
  const totalCount = Object.values(counts).reduce((a, b) => a + b, 0)
  const onTimeRate = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 100
  const atRisk = recentFailed > 0 || overdueCount > 0

  const insights: MemberInsight[] = []

  if (atRisk) {
    insights.push({
      code: 'AT_RISK', tone: 'warning',
      title: 'Action needed',
      detail: recentFailed > 0
        ? 'A recent debit didn’t go through. Please make sure funds are available before your next debit.'
        : `You have ${overdueCount} overdue contribution${overdueCount === 1 ? '' : 's'} — settle ${overdueCount === 1 ? 'it' : 'them'} to stay on track.`,
    })
  }

  if (monthlyAmount > 0 && remainingMonths > 0) {
    insights.push({
      code: 'FORECAST', tone: 'positive',
      title: 'On pace for the year',
      detail: `At ${rands(monthlyAmount)}/month you’re on track to contribute about ${rands(projectedYearEnd)} by December.`,
    })
  }

  if (onTimeRate >= 90 && totalCount >= 3) {
    insights.push({
      code: 'CONSISTENCY', tone: 'positive',
      title: 'Rock-solid consistency',
      detail: `You’ve paid ${paidCount} of ${totalCount} contributions — ${onTimeRate}% on time. Keep the streak going.`,
    })
  } else if (totalCount > 0 && onTimeRate < 70) {
    insights.push({
      code: 'CONSISTENCY_LOW', tone: 'neutral',
      title: 'Room to build consistency',
      detail: `You’re at ${onTimeRate}% on-time. A steady monthly mandate is the easiest way to climb.`,
    })
  }

  if (!activeMandate) {
    insights.push({
      code: 'NO_MANDATE', tone: 'neutral',
      title: 'Set up automatic contributions',
      detail: 'Add a payment mandate so your contributions are collected automatically each month.',
    })
  }

  return {
    forecast: { yearToDatePaid, monthlyAmount, remainingMonths, projectedYearEnd },
    stats: { paidCount, totalCount, overdueCount, onTimeRate, atRisk },
    nextDebitDay: activeMandate?.debitDay ?? null,
    insights,
  }
}
