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
