import { db } from '@/lib/db'
import { assertCanAccess } from '@/lib/authorization'

export type InsightTone = 'positive' | 'neutral' | 'warning'

export type MemberInsight = {
  code: string
  tone: InsightTone
  title: string
  detail: string
}

export type StreakInfo = {
  /** Consecutive most-recent fully-paid periods (a trailing in-progress period is ignored). */
  current: number
  /** The best run of consecutive fully-paid periods ever. */
  longest: number
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
  streak: StreakInfo
  nextDebitDay: number | null
  insights: MemberInsight[]
}

function rands(n: number): string {
  return `R ${Math.round(n).toLocaleString('en-ZA')}`
}

type PeriodRow = { periodYear: number; periodMonth: number; status: string }

/**
 * A member's contribution streak, derived purely from their period history.
 *
 * `longest` is the best run of consecutive fully-paid periods ever. `current` is
 * the trailing run of fully-paid periods, ignoring a still-in-progress period at
 * the very end (a PENDING month that isn't overdue yet). WAIVED periods are
 * transparent — an admin waiver neither breaks nor extends a streak — while a
 * PARTIAL or OVERDUE period breaks it. Pure and side-effect free so it is
 * trivially testable.
 */
export function computeStreak(periods: ReadonlyArray<PeriodRow>): StreakInfo {
  const sorted = [...periods].sort(
    (a, b) => a.periodYear - b.periodYear || a.periodMonth - b.periodMonth,
  )

  let longest = 0
  let run = 0
  for (const p of sorted) {
    if (p.status === 'PAID') {
      run += 1
      if (run > longest) longest = run
    } else if (p.status === 'WAIVED' || p.status === 'PENDING') {
      // transparent — carry the run across
    } else {
      run = 0 // PARTIAL / OVERDUE
    }
  }

  let current = 0
  for (let i = sorted.length - 1; i >= 0; i--) {
    const status = sorted[i]!.status
    if (status === 'PENDING' || status === 'WAIVED') continue
    if (status === 'PAID') {
      current += 1
      continue
    }
    break // PARTIAL / OVERDUE ends the trailing streak
  }

  return { current, longest }
}

/**
 * Member financial-health intelligence: a year-end forecast from current pace,
 * on-time consistency, a contribution streak, and risk signals — turned into a
 * few plain-language nudges. All aggregation is DB-side and parallel.
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

  const [ytdAgg, activeMandate, recentFailed, periods] = await Promise.all([
    db.contribution.aggregate({ where: { userId, periodYear: year }, _sum: { amountPaid: true } }),
    db.paymentMandate.findFirst({ where: { userId, status: 'ACTIVE' }, select: { amount: true, debitDay: true } }),
    db.transaction.count({ where: { contribution: { userId }, status: 'FAILED', createdAt: { gte: lookback } } }),
    // Full period history (one small row per month) — powers both the status
    // counts and the streak, so no separate groupBy query is needed.
    db.contribution.findMany({
      where: { userId },
      select: { periodYear: true, periodMonth: true, status: true },
    }),
  ])

  const yearToDatePaid = Number(ytdAgg._sum.amountPaid ?? 0)
  const monthlyAmount = activeMandate ? Number(activeMandate.amount) : 0
  const projectedYearEnd = yearToDatePaid + monthlyAmount * remainingMonths

  let paidCount = 0
  let overdueCount = 0
  for (const p of periods) {
    if (p.status === 'PAID') paidCount += 1
    else if (p.status === 'OVERDUE') overdueCount += 1
  }
  const totalCount = periods.length
  const onTimeRate = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 100
  const atRisk = recentFailed > 0 || overdueCount > 0
  const streak = computeStreak(periods)

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

  // Streak nudge — celebrate momentum and give a reason to protect it. A record
  // streak gets extra recognition.
  if (streak.current >= 2) {
    const isRecord = streak.current >= streak.longest && streak.current >= 3
    insights.push({
      code: isRecord ? 'STREAK_RECORD' : 'STREAK', tone: 'positive',
      title: isRecord ? `🔥 ${streak.current}-month streak — your best yet` : `🔥 ${streak.current}-month streak`,
      detail: isRecord
        ? `${streak.current} months paid in a row — a personal best. Keep this month on time to extend it.`
        : `You’ve paid ${streak.current} months running. Pay this month on time to keep it alive.`,
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
    streak,
    nextDebitDay: activeMandate?.debitDay ?? null,
    insights,
  }
}
