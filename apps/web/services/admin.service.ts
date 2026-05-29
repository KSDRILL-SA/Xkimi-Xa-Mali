import { db, Prisma } from '@/lib/db'
import { writeAuditLog } from './audit.service'
import { logger } from '@/lib/logger'
import { ForbiddenError, AdminNotFoundError, AdminConflictError } from '@/lib/errors'
import { sendSMS, normalisePhone } from '@/lib/bulksms'
import { sendWelcomeEmail } from '@/lib/email'
import { generateMonthlyContributions } from './contribution.service'

function assertAdmin(roles: string[]) {
  if (!roles.includes('ADMIN')) throw new ForbiddenError('Admin access required')
}

// ─── Types ────────────────────────────────────────────────────────────────────

type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED'
type MandateStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'

export type ListMembersParams = {
  search?: string
  status?: UserStatus
  page?: number
  limit?: number
}

export type ListMandatesParams = {
  status?: MandateStatus
  page?: number
  limit?: number
}

export type ListContributionsParams = {
  month: number
  year: number
  status?: string
  page?: number
  limit?: number
}

export type ListAuditParams = {
  entity?: string
  action?: string
  userId?: string
  page?: number
  limit?: number
}

export type BroadcastChannel = 'SMS' | 'EMAIL' | 'BOTH'
export type BroadcastFilter = 'ALL' | 'ACTIVE' | 'PENDING' | 'SUSPENDED'

// ─── Members ─────────────────────────────────────────────────────────────────

export async function listMembers(adminRoles: string[], params: ListMembersParams = {}) {
  assertAdmin(adminRoles)
  const { search, status, page = 1, limit = 20 } = params
  const skip = (page - 1) * limit

  const where = {
    ...(status && { status }),
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' as const } },
        { lastName:  { contains: search, mode: 'insensitive' as const } },
        { email:     { contains: search, mode: 'insensitive' as const } },
        { phone:     { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  }

  const [items, total] = await Promise.all([
    db.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        roles: { select: { role: true } },
        _count: {
          select: { contributions: true, mandates: true },
        },
      },
    }),
    db.user.count({ where }),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function getMemberDetail(adminRoles: string[], memberId: string) {
  assertAdmin(adminRoles)

  const member = await db.user.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
      loginAttempts: true,
      lockedUntil: true,
      createdAt: true,
      updatedAt: true,
      popiaConsentAt: true,
      roles: { select: { role: true } },
      bankAccounts: {
        select: { id: true, bankName: true, accountType: true, createdAt: true },
      },
      mandates: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, status: true, amount: true, debitDay: true, createdAt: true },
      },
      contributions: {
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
        take: 12,
        select: { id: true, periodMonth: true, periodYear: true, amountDue: true, amountPaid: true, status: true },
      },
      notificationPreference: { select: { sms: true, email: true, push: true } },
      _count: {
        select: { contributions: true, mandates: true },
      },
    },
  })

  if (!member) throw new AdminNotFoundError('Member not found')
  return member
}

export async function setMemberStatus(
  adminId: string,
  adminRoles: string[],
  memberId: string,
  newStatus: UserStatus,
  ip?: string,
) {
  assertAdmin(adminRoles)

  const member = await db.user.findUnique({ where: { id: memberId }, select: { id: true, status: true } })
  if (!member) throw new AdminNotFoundError('Member not found')
  if (member.status === newStatus) throw new AdminConflictError(`Member is already ${newStatus}`)

  const updated = await db.user.update({
    where: { id: memberId },
    data: { status: newStatus },
    select: { id: true, status: true, firstName: true, lastName: true },
  })

  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_MEMBER_STATUS_CHANGED',
    entity: 'User',
    entityId: memberId,
    payload: { from: member.status, to: newStatus },
    ipAddress: ip,
  })

  return updated
}

// ─── Mandates ─────────────────────────────────────────────────────────────────

export async function listAllMandates(adminRoles: string[], params: ListMandatesParams = {}) {
  assertAdmin(adminRoles)
  const { status, page = 1, limit = 20 } = params
  const skip = (page - 1) * limit

  const where = { ...(status && { status }) }

  const [items, total] = await Promise.all([
    db.paymentMandate.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        amount: true,
        debitDay: true,
        createdAt: true,
        netcashMandateId: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        bankAccount: { select: { bankName: true, accountType: true } },
      },
    }),
    db.paymentMandate.count({ where }),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function approveMandate(
  adminId: string,
  adminRoles: string[],
  mandateId: string,
  ip?: string,
) {
  assertAdmin(adminRoles)

  const mandate = await db.paymentMandate.findUnique({ where: { id: mandateId }, select: { id: true, status: true, userId: true } })
  if (!mandate) throw new AdminNotFoundError('Mandate not found')
  if (mandate.status !== 'PENDING') throw new AdminConflictError('Only PENDING mandates can be approved')

  const updated = await db.paymentMandate.update({
    where: { id: mandateId },
    data: { status: 'ACTIVE' },
    select: { id: true, status: true },
  })

  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_MANDATE_APPROVED',
    entity: 'PaymentMandate',
    entityId: mandateId,
    payload: { memberId: mandate.userId },
    ipAddress: ip,
  })

  return updated
}

export async function rejectMandate(
  adminId: string,
  adminRoles: string[],
  mandateId: string,
  ip?: string,
) {
  assertAdmin(adminRoles)

  const mandate = await db.paymentMandate.findUnique({ where: { id: mandateId }, select: { id: true, status: true, userId: true } })
  if (!mandate) throw new AdminNotFoundError('Mandate not found')
  if (mandate.status === 'CANCELLED') throw new AdminConflictError('Mandate is already cancelled')

  const updated = await db.paymentMandate.update({
    where: { id: mandateId },
    data: { status: 'CANCELLED' },
    select: { id: true, status: true },
  })

  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_MANDATE_REJECTED',
    entity: 'PaymentMandate',
    entityId: mandateId,
    payload: { memberId: mandate.userId },
    ipAddress: ip,
  })

  return updated
}

// ─── Contributions ────────────────────────────────────────────────────────────

export async function listAllContributions(adminRoles: string[], params: ListContributionsParams) {
  assertAdmin(adminRoles)
  const { month, year, status, page = 1, limit = 20 } = params
  const skip = (page - 1) * limit

  const where: Prisma.ContributionWhereInput = {
    periodMonth: month,
    periodYear: year,
    ...(status && { status: status as Prisma.EnumContributionStatusFilter }),
  }

  const [items, total] = await Promise.all([
    db.contribution.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        periodMonth: true,
        periodYear: true,
        amountDue: true,
        amountPaid: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
    db.contribution.count({ where }),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function bulkGenerateContributions(
  adminId: string,
  adminRoles: string[],
  month: number,
  year: number,
  ip?: string,
) {
  assertAdmin(adminRoles)

  const result = await generateMonthlyContributions(
    { month, year },
    adminId,
    adminRoles,
  )

  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_CONTRIBUTIONS_GENERATED',
    entity: 'Contribution',
    entityId: `${year}-${month}`,
    payload: { month, year, ...result },
    ipAddress: ip,
  })

  return result
}

// ─── Broadcast notifications ──────────────────────────────────────────────────

export async function broadcastNotification(
  adminId: string,
  adminRoles: string[],
  message: string,
  channel: BroadcastChannel,
  filter: BroadcastFilter,
  ip?: string,
) {
  assertAdmin(adminRoles)

  const statusFilter = filter !== 'ALL' ? { status: filter as UserStatus } : {}

  const members = await db.user.findMany({
    where: statusFilter,
    select: { id: true, email: true, phone: true, firstName: true },
  })

  let smsSent = 0
  let emailSent = 0
  let failed = 0

  for (const m of members) {
    try {
      if ((channel === 'SMS' || channel === 'BOTH') && m.phone) {
        const phone = normalisePhone(m.phone)
        if (phone) {
          await sendSMS({ to: phone, body: message })
          smsSent++
        }
      }
      if ((channel === 'EMAIL' || channel === 'BOTH') && m.email) {
        await sendWelcomeEmail(m.email, m.firstName)
        emailSent++
      }
    } catch {
      failed++
    }
  }

  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_BROADCAST_SENT',
    entity: 'Notification',
    entityId: adminId,
    payload: { channel, filter, total: members.length, smsSent, emailSent, failed },
    ipAddress: ip,
  })

  return { total: members.length, smsSent, emailSent, failed }
}

// ─── Audit log ────────────────────────────────────────────────────────────────

export async function listAuditLogs(adminRoles: string[], params: ListAuditParams = {}) {
  assertAdmin(adminRoles)
  const { entity, action, userId, page = 1, limit = 30 } = params
  const skip = (page - 1) * limit

  const where = {
    ...(entity && { entity }),
    ...(action && { action: { contains: action, mode: 'insensitive' as const } }),
    ...(userId && { userId }),
  }

  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        payload: true,
        ipAddress: true,
        createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
    db.auditLog.count({ where }),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

// ─── Dashboard stats ──────────────────────────────────────────────────────────

export async function getDashboardStats(adminRoles: string[]) {
  assertAdmin(adminRoles)

  const now = new Date()
  const thisMonth = now.getMonth() + 1
  const thisYear = now.getFullYear()
  const monthStart = new Date(thisYear, thisMonth - 1, 1)

  const [
    memberCounts,
    mandateCounts,
    contributionSummary,
    recentAuditLogs,
    poolTotal,
    pendingInvites,
  ] = await Promise.all([
    // Member counts by status
    db.user.groupBy({ by: ['status'], _count: { status: true } }),

    // Mandate counts by status
    db.paymentMandate.groupBy({ by: ['status'], _count: { status: true } }),

    // This month's contribution stats
    db.contribution.aggregate({
      where: { periodMonth: thisMonth, periodYear: thisYear },
      _count: { id: true },
      _sum: { amountDue: true, amountPaid: true },
    }),

    // Last 10 audit events for the activity feed
    db.auditLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true } },
      },
    }),

    // All-time pool total (sum of all paid contributions)
    db.contribution.aggregate({
      where: { status: 'PAID' },
      _sum: { amountPaid: true },
    }),

    // Open invitation count
    db.invitation.count({ where: { status: 'PENDING', expiresAt: { gt: now } } }),
  ])

  // Contributions received this calendar month
  const newContributionsThisMonth = await db.contribution.count({
    where: { createdAt: { gte: monthStart } },
  })

  const memberMap = Object.fromEntries(
    memberCounts.map((r) => [r.status, r._count.status]),
  )
  const mandateMap = Object.fromEntries(
    mandateCounts.map((r) => [r.status, r._count.status]),
  )

  const thisMonthDue = Number(contributionSummary._sum.amountDue ?? 0)
  const thisMonthPaid = Number(contributionSummary._sum.amountPaid ?? 0)

  return {
    members: {
      total: Object.values(memberMap).reduce((a, b) => a + b, 0),
      active: memberMap['ACTIVE'] ?? 0,
      pending: memberMap['PENDING'] ?? 0,
      suspended: memberMap['SUSPENDED'] ?? 0,
    },
    mandates: {
      active: mandateMap['ACTIVE'] ?? 0,
      pending: mandateMap['PENDING'] ?? 0,
      suspended: mandateMap['SUSPENDED'] ?? 0,
      cancelled: mandateMap['CANCELLED'] ?? 0,
    },
    contributions: {
      thisMonthTotal: contributionSummary._count.id,
      thisMonthDue,
      thisMonthPaid,
      thisMonthOutstanding: thisMonthDue - thisMonthPaid,
      collectionRate:
        thisMonthDue > 0 ? Math.round((thisMonthPaid / thisMonthDue) * 100) : 0,
      newThisMonth: newContributionsThisMonth,
    },
    pool: {
      total: Number(poolTotal._sum.amountPaid ?? 0),
    },
    invitations: {
      pending: pendingInvites,
    },
    recentActivity: recentAuditLogs,
    generatedAt: now.toISOString(),
  }
}

// ─── Goals (admin read + force-expire) ───────────────────────────────────────

export async function listAllGoals(adminRoles: string[], page = 1, limit = 20) {
  assertAdmin(adminRoles)
  const skip = (page - 1) * limit

  const [items, total] = await Promise.all([
    db.goal.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        targetAmount: true,
        currentAmount: true,
        deadline: true,
        lockedAt: true,
        createdAt: true,
      },
    }),
    db.goal.count(),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

// ─── Security ─────────────────────────────────────────────────────────────────

export async function unlockMember(
  adminId: string,
  adminRoles: string[],
  memberId: string,
  ip?: string,
) {
  assertAdmin(adminRoles)

  const member = await db.user.findUnique({
    where: { id: memberId },
    select: { id: true, loginAttempts: true, lockedUntil: true },
  })
  if (!member) throw new AdminNotFoundError('Member not found')

  await db.user.update({
    where: { id: memberId },
    data: { loginAttempts: 0, lockedUntil: null },
  })

  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_MEMBER_UNLOCKED',
    entity: 'User',
    entityId: memberId,
    payload: { previousAttempts: member.loginAttempts, wasLockedUntil: member.lockedUntil },
    ipAddress: ip,
  })

  return { memberId, unlocked: true }
}

export async function getMemberLoginHistory(
  adminRoles: string[],
  memberId: string,
  page = 1,
  limit = 20,
) {
  assertAdmin(adminRoles)

  const member = await db.user.findUnique({ where: { id: memberId }, select: { id: true } })
  if (!member) throw new AdminNotFoundError('Member not found')

  const skip = (page - 1) * limit
  const [items, total] = await Promise.all([
    db.loginHistory.findMany({
      where: { userId: memberId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: { id: true, success: true, ipAddress: true, userAgent: true, createdAt: true },
    }),
    db.loginHistory.count({ where: { userId: memberId } }),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}
