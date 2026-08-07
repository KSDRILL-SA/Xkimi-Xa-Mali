import { db } from '@/lib/db'
import { INFRASTRUCTURE_FAILURE_PREFIX } from '@xxm/utils'

/**
 * A failed transaction that says something about the member.
 *
 * A decline and a gateway outage both land as FAILED, but only one of them is
 * about the member's account. Counting an outage against them would report a
 * brother as struggling because Netcash was down, and could put a call in front
 * of someone whose money was there the whole time.
 */
export const MEMBER_ATTRIBUTABLE_FAILURE = {
  status: 'FAILED',
  failureReason: { not: { startsWith: INFRASTRUCTURE_FAILURE_PREFIX } },
} as const

/**
 * How much trouble a member's contributions are in.
 *
 * This existed twice before, computed differently in each place: the debit-day
 * job called anyone with a failed transaction in the last ninety days at risk,
 * while the member's own insights used roughly the last month and also counted
 * overdue contributions. So a member could read "Action needed" in the app and
 * receive the calm SMS the same morning. One definition, in one place, is the
 * point of this module — the same reason SUCCESSFUL_INFLOW lives in one place.
 *
 * It is also a scale rather than a flag. One declined debit two months ago is a
 * wobble; three in six weeks is a member who needs a brother to call, and the
 * previous boolean could not tell the difference.
 */

/** How far back a decline still says something about today. */
const LOOKBACK_DAYS = 90

/** At or above this many signals, a person should hear about it, not just a phone. */
const AT_RISK_THRESHOLD = 2

export type RiskTier = 'STEADY' | 'WATCH' | 'AT_RISK'

export interface MemberRisk {
  userId: string
  tier: RiskTier
  /** Declined debits inside the lookback window. */
  recentFailures: number
  /** Contributions still unpaid past their due date. */
  overdueCount: number
  /**
   * Why this tier, in words a member or an admin can read. Empty when steady —
   * there is nothing to explain about someone who is fine.
   */
  reasons: string[]
}

function tierFor(recentFailures: number, overdueCount: number): RiskTier {
  const signals = recentFailures + overdueCount
  if (signals === 0) return 'STEADY'
  return signals >= AT_RISK_THRESHOLD ? 'AT_RISK' : 'WATCH'
}

function reasonsFor(recentFailures: number, overdueCount: number): string[] {
  const reasons: string[] = []
  if (recentFailures === 1) reasons.push('a debit was declined recently')
  if (recentFailures > 1) reasons.push(`${recentFailures} debits were declined in the last ${LOOKBACK_DAYS} days`)
  if (overdueCount === 1) reasons.push('one contribution is overdue')
  if (overdueCount > 1) reasons.push(`${overdueCount} contributions are overdue`)
  return reasons
}

function build(userId: string, recentFailures: number, overdueCount: number): MemberRisk {
  return {
    userId,
    tier: tierFor(recentFailures, overdueCount),
    recentFailures,
    overdueCount,
    reasons: reasonsFor(recentFailures, overdueCount),
  }
}

/** The tiering rule on its own, for callers that already hold the counts. */
export function assessFromCounts(userId: string, recentFailures: number, overdueCount: number): MemberRisk {
  return build(userId, recentFailures, overdueCount)
}

/**
 * Assess many members at once.
 *
 * Two queries regardless of how many members are passed. The debit-day job runs
 * this over everyone due that morning, so a per-member round trip here would
 * reintroduce exactly the shape #253 removed from the nightly job.
 */
export async function assessMemberRisks(userIds: readonly string[]): Promise<Map<string, MemberRisk>> {
  const result = new Map<string, MemberRisk>()
  if (userIds.length === 0) return result

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)

  const [failureRows, overdueRows] = await Promise.all([
    // Grouping by a relation field is beyond Prisma's groupBy, so the rows come
    // back and are tallied here — still one query for the whole cohort.
    db.transaction.findMany({
      where: {
        ...MEMBER_ATTRIBUTABLE_FAILURE,
        createdAt: { gte: since },
        contribution: { userId: { in: [...userIds] } },
      },
      select: { contribution: { select: { userId: true } } },
    }),
    db.contribution.groupBy({
      by: ['userId'],
      where: { userId: { in: [...userIds] }, status: 'OVERDUE' },
      _count: { _all: true },
    }),
  ])

  const failures = new Map<string, number>()
  for (const row of failureRows) {
    const id = row.contribution?.userId
    if (id) failures.set(id, (failures.get(id) ?? 0) + 1)
  }

  const overdue = new Map<string, number>()
  for (const row of overdueRows) {
    overdue.set(row.userId, row._count._all)
  }

  for (const userId of userIds) {
    result.set(userId, build(userId, failures.get(userId) ?? 0, overdue.get(userId) ?? 0))
  }

  return result
}

/** Assess one member. */
export async function assessMemberRisk(userId: string): Promise<MemberRisk> {
  const risks = await assessMemberRisks([userId])
  return risks.get(userId) ?? build(userId, 0, 0)
}

/** Whether this member should be warned more firmly than usual before a debit. */
export function needsUrgentWarning(risk: MemberRisk): boolean {
  return risk.tier !== 'STEADY'
}

/** Whether a person, not just a phone, should hear about this member. */
export function needsHumanOutreach(risk: MemberRisk): boolean {
  return risk.tier === 'AT_RISK'
}
