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
    // Every rand received, not only the rands that finished settling a period.
    //
    // This filtered on `status: 'PAID'`, so a member who had paid R250 of R400
    // contributed nothing as far as the headline figure was concerned — their
    // contribution is PARTIAL, and PARTIAL was not counted. The label says
    // "all-time collected", which is a claim about money received.
    //
    // The member app has always summed `amountPaid` without a status filter
    // when deriving the primary fund's total, so the two apps disagreed about
    // how much money exists. `amountPaid` is itself derived from settled
    // transactions and comes back down on a reversal, so summing it unfiltered
    // is the honest figure rather than a looser one.
    db.contribution.aggregate({ _sum: { amountPaid: true } }),
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

  // Conferred, not earned — a separate table that the badge score knows nothing
  // about. One query for the page rather than one per row; there are at most
  // four holders, so this reads a table that cannot grow.
  const founders = new Set(
    (
      await db.memberDistinction.findMany({
        where: { kind: 'FOUNDER' },
        select: { userId: true },
      })
    ).map((d) => d.userId),
  )

  return {
    items: items.map((s) => ({
      userId: s.userId,
      isFounder: founders.has(s.userId),
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
      // Carried so the console can say how old these figures are. They move on
      // a contribution status change and once a month by cron, so a badge is a
      // month old in ordinary operation — and stays put indefinitely if the
      // event is lost, which has happened.
      lastCalculatedAt: s.lastCalculatedAt,
      // Decided here rather than while rendering. A component that reads the
      // clock produces output depending on when it happened to run, which is
      // what React's purity rule forbids and what `serializeGoal` says in the
      // member app for the same reason. A month plus slack: recalculation runs
      // on the first, so older than this means the monthly pass did not reach
      // this member and nothing of theirs has changed status since.
      isStale: !s.lastCalculatedAt
        || (Date.now() - new Date(s.lastCalculatedAt).getTime()) > 35 * 86_400_000,
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
        -- The casts are load-bearing. Prisma binds these as int8, and there is
        -- no make_date(bigint, bigint, integer) — Postgres refuses the whole
        -- query with 42883, which took the entire Reports page down with it.
        AND date_trunc('month', n."createdAt") = make_date(${year}::int, ${month}::int, 1)
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

/**
 * How many people a broadcast would actually reach, per filter.
 *
 * Broadcasting is the one action on this console that reaches everybody at
 * once, costs real money per recipient when SMS is chosen, and cannot be
 * recalled. It was a plain submit button, and the admin could not see how many
 * people were behind the filter they had picked until after it had gone.
 *
 * Four counts on an indexed column, on a page that is opened to send one
 * message.
 */
export async function getBroadcastAudience(adminRoles: string[]) {
  assertAdmin(adminRoles)

  const [all, active, pending, suspended] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { status: 'ACTIVE' } }),
    db.user.count({ where: { status: 'PENDING' } }),
    db.user.count({ where: { status: 'SUSPENDED' } }),
  ])

  return { ALL: all, ACTIVE: active, PENDING: pending, SUSPENDED: suspended }
}
