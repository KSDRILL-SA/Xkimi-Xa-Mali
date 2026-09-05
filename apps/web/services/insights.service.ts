import { db } from '@/lib/db'
import { assessFromCounts, MEMBER_ATTRIBUTABLE_FAILURE } from '@/services/risk.service'
import { assertCanAccess } from '@/lib/authorization'
import { subtractZAR, sumZAR, multiplyZAR } from '@/lib/money'
import { cache, CACHE_KEYS } from '@/lib/cache'

// Streak lengths worth celebrating. When a member is exactly one month short of
// the next one, that gets a focused "almost there" nudge.
const STREAK_MILESTONES = [3, 6, 12, 24] as const

// Only rally the group around a goal once it is genuinely within reach.
const GOAL_NEAR_THRESHOLD_PCT = 70

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

export type GroupPulse = {
  /** Total contributed by the whole group so far this month. */
  pooledThisMonth: number
  /** Members who have paid this month. */
  contributorsThisMonth: number
  /** Active members in the group. */
  activeMembers: number
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
  groupPulse: GroupPulse
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

type GoalRow = { title: string; targetAmount: unknown; currentAmount: unknown }

/**
 * Of the active group goals, the one nearest its target — but only once it is at
 * least GOAL_NEAR_THRESHOLD_PCT funded and not yet complete. Returns the funded
 * percentage and the exact rand amount still needed, or null when nothing is
 * close enough to rally around.
 */
export function pickGoalNearingTarget(
  goals: ReadonlyArray<GoalRow>,
): { title: string; pct: number; remaining: number } | null {
  let best: { title: string; pct: number; remaining: number } | null = null
  for (const g of goals) {
    const target = Number(g.targetAmount)
    const current = Number(g.currentAmount)
    if (!(target > 0)) continue
    const pct = Math.min(100, Math.round((current / target) * 100))
    if (pct >= GOAL_NEAR_THRESHOLD_PCT && pct < 100 && (best === null || pct > best.pct)) {
      best = { title: g.title, pct, remaining: Math.max(0, subtractZAR(target, current)) }
    }
  }
  return best
}

/**
 * The group's collective "pulse" this month — total pooled, how many members
 * have contributed, and the active membership. Identical for everyone, so it is
 * cached once globally (short TTL) rather than recomputed on every member's
 * dashboard. A stokvel is a shared effort; showing the whole group's momentum is
 * a strong reason to keep turning up.
 */
export async function getGroupPulse(): Promise<GroupPulse> {
  const cached = await cache.get<GroupPulse>(CACHE_KEYS.GROUP_PULSE)
  if (cached) return cached

  const now = new Date()
  const periodYear = now.getFullYear()
  const periodMonth = now.getMonth() + 1

  const [pooledAgg, contributors, activeMembers] = await Promise.all([
    db.contribution.aggregate({ where: { periodYear, periodMonth }, _sum: { amountPaid: true } }),
    db.contribution.count({ where: { periodYear, periodMonth, status: 'PAID' } }),
    db.user.count({ where: { status: 'ACTIVE' } }),
  ])

  const pulse: GroupPulse = {
    pooledThisMonth: Number(pooledAgg._sum.amountPaid ?? 0),
    contributorsThisMonth: contributors,
    activeMembers,
  }

  await cache.set(CACHE_KEYS.GROUP_PULSE, pulse, CACHE_KEYS.GROUP_PULSE_TTL)
  return pulse
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
  // Authorization is always enforced live — never served from cache.
  assertCanAccess(userId, requesterId, roles)

  const cacheKey = CACHE_KEYS.memberInsights(userId)
  const cached = await cache.get<MemberInsights>(cacheKey)
  if (cached) return cached

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const remainingMonths = Math.max(0, 12 - month)
  const lookback = new Date(year, month - 2, 1) // ~start of last month

  const [ytdAgg, activeMandate, recentFailed, periods, activeGoals, groupPulse] = await Promise.all([
    db.contribution.aggregate({ where: { userId, periodYear: year }, _sum: { amountPaid: true } }),
    db.paymentMandate.findFirst({ where: { userId, status: 'ACTIVE' }, select: { amount: true, debitDay: true } }),
    db.transaction.count({ where: { contribution: { userId }, ...MEMBER_ATTRIBUTABLE_FAILURE, createdAt: { gte: lookback } } }),
    // Full period history (one small row per month) — powers both the status
    // counts and the streak, so no separate groupBy query is needed.
    db.contribution.findMany({
      where: { userId },
      select: { periodYear: true, periodMonth: true, status: true },
    }),
    // Active group goals — to rally the member around one that's nearly funded.
    db.goal.findMany({
      where: { status: 'ACTIVE' },
      select: { title: true, targetAmount: true, currentAmount: true },
    }),
    // Group-wide momentum (globally cached, shared by every member).
    getGroupPulse(),
  ])

  const yearToDatePaid = Number(ytdAgg._sum.amountPaid ?? 0)
  const monthlyAmount = activeMandate ? Number(activeMandate.amount) : 0
  // Through the helpers, like every other money operation. The figure is
  // shown to a member as what they are on course to have saved by December,
  // and `a + b * n` on rand values is exactly the chained arithmetic the
  // contract in lib/money exists to keep out of the financial path.
  const projectedYearEnd = sumZAR(yearToDatePaid, multiplyZAR(monthlyAmount, remainingMonths))

  let paidCount = 0
  let overdueCount = 0
  for (const p of periods) {
    if (p.status === 'PAID') paidCount += 1
    else if (p.status === 'OVERDUE') overdueCount += 1
  }
  const totalCount = periods.length
  const onTimeRate = totalCount > 0 ? Math.round((paidCount / totalCount) * 100) : 100
  // The same rule the debit-day job applies, from the same module — these two
  // used different windows before, so the app and the SMS could disagree about
  // whether a member was in trouble.
  const risk = assessFromCounts(userId, recentFailed, overdueCount)
  const atRisk = risk.tier !== 'STEADY'
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

  // Streak — one nudge only. If a milestone is exactly one month away, that
  // "almost there" beats the generic momentum message.
  const nextMilestone = STREAK_MILESTONES.find((m) => m > streak.current)
  if (nextMilestone !== undefined && nextMilestone - streak.current === 1) {
    insights.push({
      code: 'STREAK_MILESTONE', tone: 'positive',
      title: 'One month away',
      detail: `Pay this month on time and you’ll hit a ${nextMilestone}-month streak. So close — don’t stop now.`,
    })
  } else if (streak.current >= 2) {
    const isRecord = streak.current >= streak.longest && streak.current >= 3
    insights.push({
      code: isRecord ? 'STREAK_RECORD' : 'STREAK', tone: 'positive',
      title: isRecord ? `🔥 ${streak.current}-month streak — your best yet` : `🔥 ${streak.current}-month streak`,
      detail: isRecord
        ? `${streak.current} months paid in a row — a personal best. Keep this month on time to extend it.`
        : `You’ve paid ${streak.current} months running. Pay this month on time to keep it alive.`,
    })
  }

  // Group goal within reach — a collective "almost there" to rally contributions.
  const nearingGoal = pickGoalNearingTarget(activeGoals)
  if (nearingGoal) {
    insights.push({
      code: 'GOAL_NEAR', tone: 'positive',
      title: 'The group is almost there',
      detail: `“${nearingGoal.title}” is ${nearingGoal.pct}% funded — just ${rands(nearingGoal.remaining)} to the target. Every contribution counts.`,
    })
  }

  // Group pulse — collective momentum, the reason a stokvel works. Only shown
  // once there's real activity this month.
  if (groupPulse.pooledThisMonth > 0 && groupPulse.contributorsThisMonth > 0) {
    const members = groupPulse.contributorsThisMonth
    insights.push({
      code: 'GROUP_PULSE', tone: 'positive',
      title: 'The group is moving together',
      detail: `${members} member${members === 1 ? '' : 's'} pooled ${rands(groupPulse.pooledThisMonth)} this month. You’re part of something bigger.`,
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

  const result: MemberInsights = {
    forecast: { yearToDatePaid, monthlyAmount, remainingMonths, projectedYearEnd },
    stats: { paidCount, totalCount, overdueCount, onTimeRate, atRisk },
    streak,
    groupPulse,
    nextDebitDay: activeMandate?.debitDay ?? null,
    insights,
  }

  await cache.set(cacheKey, result, CACHE_KEYS.INSIGHTS_TTL)
  return result
}
