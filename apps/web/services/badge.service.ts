import type { BadgeTier, Contribution } from '@prisma/client'
import { badgeRepo } from '@/repositories/badge.repository'
import { contributionRepo } from '@/repositories/contribution.repository'
import { assertCanAccess, assertAdmin } from '@/lib/authorization'
import { logger } from '@/lib/logger'
import { queueNotification } from './notification.service'

// ─── Constants ────────────────────────────────────────────────────────────────

const GRACE_PERIOD_MS = 60 * 24 * 60 * 60 * 1000 // 60 days
const PROGRESS_NOTIFY_THRESHOLD = 80

const TIER_RANK: Record<BadgeTier, number> = {
  AMATEUR: 0,
  SEMI_PRO: 1,
  PRO: 2,
  WORLD_CLASS: 3,
}

// ─── Metrics ────────────────────────────────────────────────────────────────

type BadgeMetrics = {
  overallScore: number
  consistencyScore: number
  timelinessScore: number
  generosityScore: number
  streakBonus: number
  currentStreak: number
  longestStreak: number
  totalPaidMonths: number
  totalOnTimeMonths: number
  totalOverdue: number
  overdueInLast6: number
  monthsActive: number
  avgContribution: number
}

function isOnTimePaid(c: Contribution): boolean {
  return c.status === 'PAID' && c.updatedAt <= c.dueDate
}

async function calculateMetrics(userId: string): Promise<BadgeMetrics> {
  const contributions = await contributionRepo.findMany(
    { userId },
    { orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }] },
  ) as Contribution[]

  const monthsActive = contributions.length
  const paid = contributions.filter((c) => c.status === 'PAID')
  const totalPaidMonths = paid.length
  const totalOnTimeMonths = contributions.filter(isOnTimePaid).length
  const totalOverdue = contributions.filter((c) => c.status === 'OVERDUE').length

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const overdueInLast6 = contributions.filter(
    (c) => c.status === 'OVERDUE' && c.dueDate >= sixMonthsAgo,
  ).length

  const paidAmounts = paid.map((c) => Number(c.amountPaid)).filter((a) => a > 0)
  const avgContribution = paidAmounts.length > 0
    ? paidAmounts.reduce((sum, a) => sum + a, 0) / paidAmounts.length
    : 0

  // Walk chronologically: an on-time paid month extends the streak, a still-pending
  // month (the current period) leaves it untouched, anything else resets it.
  let runningStreak = 0
  let longestStreak = 0
  let currentStreak = 0
  for (const c of contributions) {
    if (isOnTimePaid(c)) {
      runningStreak += 1
      currentStreak = runningStreak
      longestStreak = Math.max(longestStreak, runningStreak)
    } else if (c.status !== 'PENDING') {
      runningStreak = 0
      currentStreak = 0
    }
  }

  const consistencyScore = monthsActive > 0 ? (totalPaidMonths / monthsActive) * 100 : 0
  const timelinessScore = totalPaidMonths > 0 ? (totalOnTimeMonths / totalPaidMonths) * 100 : 0
  const generosityScore = Math.min(Math.max(((avgContribution - 100) / 100) * 50, 0), 100)
  const streakBonus = Math.min((currentStreak / 12) * 100, 100)

  const overallScore =
    consistencyScore * 0.4 + timelinessScore * 0.35 + generosityScore * 0.15 + streakBonus * 0.1

  return {
    overallScore,
    consistencyScore,
    timelinessScore,
    generosityScore,
    streakBonus,
    currentStreak,
    longestStreak,
    totalPaidMonths,
    totalOnTimeMonths,
    totalOverdue,
    overdueInLast6,
    monthsActive,
    avgContribution,
  }
}

// ─── Tier rules ─────────────────────────────────────────────────────────────

function determineTier(m: BadgeMetrics): BadgeTier {
  if (
    m.monthsActive >= 12 &&
    m.overallScore >= 82 &&
    m.consistencyScore >= 95 &&
    m.timelinessScore >= 90 &&
    m.totalOverdue === 0 &&
    m.currentStreak >= 6
  ) {
    return 'WORLD_CLASS'
  }

  if (
    m.monthsActive >= 6 &&
    m.overallScore >= 65 &&
    m.consistencyScore >= 85 &&
    m.timelinessScore >= 80 &&
    m.overdueInLast6 === 0
  ) {
    return 'PRO'
  }

  if (m.monthsActive >= 3 && m.overallScore >= 45 && m.consistencyScore >= 70) {
    return 'SEMI_PRO'
  }

  return 'AMATEUR'
}

function fulfillment(value: number, threshold: number): number {
  return Math.min(value / threshold, 1) * 100
}

function fulfillmentAtZero(value: number): number {
  return value === 0 ? 100 : 0
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** Average fulfillment of every requirement for the tier above `currentBadge`. */
function calculateProgress(m: BadgeMetrics, currentBadge: BadgeTier): number {
  switch (currentBadge) {
    case 'AMATEUR':
      return average([
        fulfillment(m.monthsActive, 3),
        fulfillment(m.overallScore, 45),
        fulfillment(m.consistencyScore, 70),
      ])
    case 'SEMI_PRO':
      return average([
        fulfillment(m.monthsActive, 6),
        fulfillment(m.overallScore, 65),
        fulfillment(m.consistencyScore, 85),
        fulfillment(m.timelinessScore, 80),
        fulfillmentAtZero(m.overdueInLast6),
      ])
    case 'PRO':
      return average([
        fulfillment(m.monthsActive, 12),
        fulfillment(m.overallScore, 82),
        fulfillment(m.consistencyScore, 95),
        fulfillment(m.timelinessScore, 90),
        fulfillmentAtZero(m.totalOverdue),
        fulfillment(m.currentStreak, 6),
      ])
    case 'WORLD_CLASS':
      return 100
  }
}

function buildScoreData(m: BadgeMetrics, currentBadge: BadgeTier, graceUntil: Date | null) {
  return {
    currentBadge,
    overallScore: m.overallScore,
    consistencyScore: m.consistencyScore,
    timelinessScore: m.timelinessScore,
    generosityScore: m.generosityScore,
    streakBonus: m.streakBonus,
    progressToNext: calculateProgress(m, currentBadge),
    currentStreak: m.currentStreak,
    longestStreak: m.longestStreak,
    totalPaidMonths: m.totalPaidMonths,
    totalOnTimeMonths: m.totalOnTimeMonths,
    totalOverdue: m.totalOverdue,
    overdueInLast6: m.overdueInLast6,
    monthsActive: m.monthsActive,
    avgContribution: m.avgContribution,
    graceUntil,
    lastCalculatedAt: new Date(),
  }
}

// ─── Recalculation ────────────────────────────────────────────────────────────

/** Recompute one member's badge score, applying promotion/grace rules. Returns the new state. */
export async function recalculateOne(userId: string, trigger: string) {
  const [metrics, existing] = await Promise.all([
    calculateMetrics(userId),
    badgeRepo.findByUser(userId),
  ])

  const eligibleTier = determineTier(metrics)
  const currentBadge = existing?.currentBadge ?? 'AMATEUR'
  const previousProgress = existing ? Number(existing.progressToNext) : 0

  let newBadge = currentBadge
  let graceUntil: Date | null = existing?.graceUntil ?? null
  let promoted = false

  if (TIER_RANK[eligibleTier] >= TIER_RANK[currentBadge]) {
    if (eligibleTier !== currentBadge) {
      newBadge = eligibleTier
      promoted = true
    }
    graceUntil = null
  } else if (graceUntil === null) {
    graceUntil = new Date(Date.now() + GRACE_PERIOD_MS)
  }

  const data = buildScoreData(metrics, newBadge, graceUntil)
  await badgeRepo.upsert(userId, data)

  if (promoted) {
    await badgeRepo.createHistoryEntry({
      userId,
      fromBadge: currentBadge,
      toBadge: newBadge,
      trigger,
      score: metrics.overallScore,
    })

    await Promise.all([
      queueNotification({
        userId,
        templateSlug: 'badge-level-up',
        channel: 'SMS',
        payload: { tier: newBadge },
      }),
      queueNotification({
        userId,
        templateSlug: 'badge-level-up-email',
        channel: 'EMAIL',
        payload: { tier: newBadge },
      }),
    ])
  }

  if (
    !promoted &&
    newBadge !== 'WORLD_CLASS' &&
    data.progressToNext >= PROGRESS_NOTIFY_THRESHOLD &&
    previousProgress < PROGRESS_NOTIFY_THRESHOLD
  ) {
    await queueNotification({
      userId,
      templateSlug: 'badge-progress-80',
      channel: 'PUSH',
      payload: { progress: Math.round(data.progressToNext) },
    })
  }

  return { userId, currentBadge: newBadge, eligibleTier, progressToNext: data.progressToNext }
}

/** Recalculate every active member's badge score (monthly Inngest job). */
export async function recalculateAll(trigger: string) {
  const users = await badgeRepo.findAllActiveUserIds()
  let processed = 0

  for (const { id } of users) {
    try {
      await recalculateOne(id, trigger)
      processed += 1
    } catch (err) {
      logger.error('Badge recalculation failed for user', {
        userId: id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return processed
}

/** Demote members whose downgrade grace period has expired without recovery. */
export async function checkGraceExpiry() {
  const expired = await badgeRepo.findUsersInExpiredGrace()
  let demoted = 0

  for (const score of expired) {
    try {
      const metrics = await calculateMetrics(score.userId)
      const eligibleTier = determineTier(metrics)
      const currentBadge = score.currentBadge

      if (TIER_RANK[eligibleTier] >= TIER_RANK[currentBadge]) {
        // Recovered during the grace period — clear grace, keep current tier.
        await badgeRepo.upsert(score.userId, buildScoreData(metrics, currentBadge, null))
        continue
      }

      await badgeRepo.upsert(score.userId, buildScoreData(metrics, eligibleTier, null))

      await badgeRepo.createHistoryEntry({
        userId: score.userId,
        fromBadge: currentBadge,
        toBadge: eligibleTier,
        trigger: 'grace_expired',
        score: metrics.overallScore,
      })

      await queueNotification({
        userId: score.userId,
        templateSlug: 'badge-level-down',
        channel: 'SMS',
        payload: { tier: eligibleTier },
      })

      demoted += 1
    } catch (err) {
      logger.error('Badge grace check failed for user', {
        userId: score.userId,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return demoted
}

// ─── Reads ──────────────────────────────────────────────────────────────────

function serializeBadgeScore(score: {
  currentBadge: BadgeTier
  overallScore: unknown
  consistencyScore: unknown
  timelinessScore: unknown
  generosityScore: unknown
  streakBonus: unknown
  progressToNext: unknown
  currentStreak: number
  longestStreak: number
  totalPaidMonths: number
  totalOnTimeMonths: number
  totalOverdue: number
  overdueInLast6: number
  monthsActive: number
  avgContribution: unknown
  graceUntil: Date | null
  lastCalculatedAt: Date
}) {
  return {
    currentBadge: score.currentBadge,
    overallScore: Number(score.overallScore),
    consistencyScore: Number(score.consistencyScore),
    timelinessScore: Number(score.timelinessScore),
    generosityScore: Number(score.generosityScore),
    streakBonus: Number(score.streakBonus),
    progressToNext: Number(score.progressToNext),
    currentStreak: score.currentStreak,
    longestStreak: score.longestStreak,
    totalPaidMonths: score.totalPaidMonths,
    totalOnTimeMonths: score.totalOnTimeMonths,
    totalOverdue: score.totalOverdue,
    overdueInLast6: score.overdueInLast6,
    monthsActive: score.monthsActive,
    avgContribution: Number(score.avgContribution),
    graceUntil: score.graceUntil?.toISOString() ?? null,
    lastCalculatedAt: score.lastCalculatedAt.toISOString(),
  }
}

/** A member's own badge score, progress and tier-change history. */
export async function getMyBadge(userId: string, requesterId: string, roles: string[]) {
  assertCanAccess(userId, requesterId, roles)

  let score = await badgeRepo.findByUser(userId)
  if (!score) {
    await recalculateOne(userId, 'initial')
    score = await badgeRepo.findByUser(userId)
  }

  const history = await badgeRepo.findHistoryByUser(userId)

  return {
    ...serializeBadgeScore(score!),
    history: history.map((h) => ({
      id: h.id,
      fromBadge: h.fromBadge,
      toBadge: h.toBadge,
      trigger: h.trigger,
      score: Number(h.score),
      createdAt: h.createdAt.toISOString(),
    })),
  }
}

/** All members' names + badge tier — no scores (community board). */
export async function getCommunityBadges() {
  const members = await badgeRepo.findAllForCommunity()
  return members.map((m) => ({
    userId: m.userId,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    currentBadge: m.currentBadge,
  }))
}

/** All members with full scores + progress (admin only). */
export async function getAllBadgesWithScores(
  roles: string[],
  opts: { page?: number; limit?: number; tier?: BadgeTier } = {},
) {
  assertAdmin(roles)

  const page = opts.page ?? 1
  const limit = opts.limit ?? 20
  const where = opts.tier ? { currentBadge: opts.tier } : {}

  const [items, total] = await Promise.all([
    badgeRepo.findAllWithScores({
      where,
      orderBy: { overallScore: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    badgeRepo.count(where),
  ])

  return {
    items: items.map((item) => ({
      ...serializeBadgeScore(item),
      userId: item.userId,
      user: {
        id: item.user.id,
        firstName: item.user.firstName,
        lastName: item.user.lastName,
        email: item.user.email,
      },
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}
