import { BadgeTier } from '@prisma/client'
import { db, Prisma } from '@/lib/db'
import { assertAdmin } from './shared'

// ─── Dashboard stats ──────────────────────────────────────────────────────────

export async function getDashboardStats(adminRoles: string[]) {
  assertAdmin(adminRoles)

  const now       = new Date()
  const month     = now.getMonth() + 1
  const year      = now.getFullYear()

  const [memberCount, activeContribs, poolResult, pendingMandates] = await Promise.all([
    db.user.count({ where: { status: 'ACTIVE' } }),
    db.contribution.findMany({
      where: { periodMonth: month, periodYear: year },
      select: { amountDue: true, amountPaid: true, status: true },
    }),
    db.contribution.aggregate({ where: { status: 'PAID' }, _sum: { amountPaid: true } }),
    db.paymentMandate.count({ where: { status: 'PENDING' } }),
  ])

  const totalDue       = activeContribs.reduce((s, c) => s + Number(c.amountDue),  0)
  const totalPaid      = activeContribs.reduce((s, c) => s + Number(c.amountPaid), 0)
  const poolTotal      = Number(poolResult._sum.amountPaid ?? 0)
  const collectionRate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0

  return { month, year, memberCount, totalDue, totalPaid, poolTotal, collectionRate, pendingMandates }
}

// ─── Reports ──────────────────────────────────────────────────────────────────

export async function getMonthlyReportSummary(adminRoles: string[], month: number, year: number) {
  assertAdmin(adminRoles)

  const [contributions, memberCount] = await Promise.all([
    db.contribution.findMany({
      where: { periodMonth: month, periodYear: year },
      select: { amountDue: true, amountPaid: true, status: true },
    }),
    db.user.count({ where: { status: 'ACTIVE' } }),
  ])

  const totalDue   = contributions.reduce((s, c) => s + Number(c.amountDue),  0)
  const totalPaid  = contributions.reduce((s, c) => s + Number(c.amountPaid), 0)
  const paidCount  = contributions.filter((c) => c.status === 'PAID').length
  const collectionRate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 100) : 0

  return { month, year, memberCount, totalDue, totalPaid, paidCount, collectionRate, contributions }
}

export async function getContributionsForExport(adminRoles: string[], month: number, year: number) {
  assertAdmin(adminRoles)

  return db.contribution.findMany({
    where: { periodMonth: month, periodYear: year },
    select: {
      amountDue:  true,
      amountPaid: true,
      dueDate:    true,
      status:     true,
      user: {
        select: {
          firstName: true,
          lastName:  true,
          email:     true,
          phone:     true,
        },
      },
    },
    orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
  })
}

// ─── Badges ───────────────────────────────────────────────────────────────────

export async function listAllBadges(
  adminRoles: string[],
  params: { page?: number; limit?: number; tier?: BadgeTier } = {},
) {
  assertAdmin(adminRoles)
  const { page = 1, limit = 20, tier } = params
  const skip = (page - 1) * limit
  const where: Prisma.BadgeScoreWhereInput = tier ? { currentBadge: tier } : {}

  const [items, total] = await Promise.all([
    db.badgeScore.findMany({
      where, skip, take: limit,
      orderBy: { overallScore: 'desc' },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
    }),
    db.badgeScore.count({ where }),
  ])

  return {
    items: items.map((s) => ({
      userId: s.userId,
      user: { id: s.user.id, firstName: s.user.firstName, lastName: s.user.lastName, email: s.user.email },
      currentBadge: s.currentBadge,
      overallScore: Number(s.overallScore),
      consistencyScore: Number(s.consistencyScore),
      timelinessScore: Number(s.timelinessScore),
      generosityScore: Number(s.generosityScore),
      streakBonus: Number(s.streakBonus),
      progressToNext: Number(s.progressToNext),
      currentStreak: s.currentStreak,
      monthsActive: s.monthsActive,
      totalOverdue: s.totalOverdue,
    })),
    total, page, limit, totalPages: Math.ceil(total / limit),
  }
}

// ─── Nudge outcomes ───────────────────────────────────────────────────────────

export interface NudgeOutcome {
  slug: string
  /** What the message is trying to bring about. */
  intent: string
  sent: number
  /** Recipients who reached that outcome. */
  reached: number
  /** reached / sent, as a percentage. Null when nothing was sent. */
  rate: number | null
}

/**
 * How often each nudge is followed by the outcome it is asking for.
 *
 * Read this as an OUTCOME RATE, not an effect. Every eligible member receives
 * these messages, so there is no unexposed group to compare against and nothing
 * here can tell you what would have happened had the message not been sent. A
 * member who was always going to pay on time is counted as reached.
 *
 * It is still worth knowing. A firm warning that is followed by a decline four
 * times in five is not doing its job, and until now nothing in the system could
 * have told anyone that.
 *
 * Two queries, both grouped in the database.
 */
export async function getNudgeOutcomes(
  adminRoles: string[],
  month: number,
  year: number,
): Promise<NudgeOutcome[]> {
  assertAdmin(adminRoles)

  const [earlyPayment, debitDay] = await Promise.all([
    // Reminded a few days before the due date: did the contribution get settled
    // on or before that date?
    db.$queryRaw<Array<{ sent: bigint; reached: bigint }>>`
      SELECT COUNT(*)::bigint AS sent,
             COUNT(*) FILTER (
               WHERE c.status IN ('PAID', 'WAIVED') AND c."updatedAt" <= c."dueDate"
             )::bigint AS reached
      FROM notifications n
      JOIN notification_templates t ON t.id = n."templateId"
      JOIN contributions c ON c.id = n.payload->>'contributionId'
      WHERE t.slug = 'contribution-due-reminder'
        AND c."periodMonth" = ${month} AND c."periodYear" = ${year}
    `,
    // Warned on the morning of the debit: did that month's contribution settle
    // at all? The warning names an amount coming off tonight, so "settled" is
    // the outcome it is asking for.
    db.$queryRaw<Array<{ sent: bigint; reached: bigint }>>`
      SELECT COUNT(DISTINCT n."userId")::bigint AS sent,
             COUNT(DISTINCT n."userId") FILTER (
               WHERE c.status IN ('PAID', 'WAIVED')
             )::bigint AS reached
      FROM notifications n
      JOIN notification_templates t ON t.id = n."templateId"
      JOIN contributions c
        ON c."userId" = n."userId"
       AND c."periodMonth" = ${month} AND c."periodYear" = ${year}
      WHERE t.slug IN ('debit-morning-warning', 'debit-morning-warning-urgent')
        AND date_trunc('month', n."createdAt") = make_date(${year}, ${month}, 1)
    `,
  ])

  const toOutcome = (
    slug: string,
    intent: string,
    rows: Array<{ sent: bigint; reached: bigint }>,
  ): NudgeOutcome => {
    const sent = Number(rows[0]?.sent ?? 0)
    const reached = Number(rows[0]?.reached ?? 0)
    return { slug, intent, sent, reached, rate: sent > 0 ? Math.round((reached / sent) * 100) : null }
  }

  return [
    toOutcome('contribution-due-reminder', 'Paid on or before the due date', earlyPayment),
    toOutcome('debit-morning-warning', 'Contribution settled this month', debitDay),
  ]
}
