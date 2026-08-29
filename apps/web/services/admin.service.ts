import { Prisma } from '@prisma/client'
import { writeAuditLog } from './audit.service'
import { queueNotification } from './notification.service'
import { createInboxMessages } from './inbox.service'
import { AdminNotFoundError, AdminConflictError } from '@/lib/errors'
import { assertAdmin, assertNotSelf } from '@/lib/authorization'
import { isValidSAId } from '@xxm/utils/sa-id'
import { escapeHtml } from '@xxm/utils'
import { encrypt } from '@/lib/encryption'
import { paymentGateway } from '@/integrations/payment'
import { raiseGatewayDesyncAlert } from './mandate.service'
import { logger } from '@xxm/observability'
import { smsProvider } from '@/integrations/sms'
import { emailProvider } from '@/integrations/email'
import { generateMonthlyContributions } from './contribution.service'
import { cache, CACHE_KEYS } from '@/lib/cache'
import { tallyBy } from '@/lib/aggregate'
import { subtractZAR } from '@/lib/money'
import { bumpRoleVersion } from '@/lib/role-version'
import { userRepo } from '@/repositories/user.repository'
import { mandateRepo } from '@/repositories/mandate.repository'
import { contributionRepo } from '@/repositories/contribution.repository'
import { auditRepo } from '@/repositories/audit.repository'
import { goalRepo } from '@/repositories/goal.repository'
import { invitationRepo } from '@/repositories/invitation.repository'

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

export type BroadcastChannel = 'SMS' | 'EMAIL' | 'BOTH' | 'IN_APP'
export type BroadcastFilter = 'ALL' | 'ACTIVE' | 'PENDING' | 'SUSPENDED'

type DashboardStats = {
  members: { total: number; active: number; pending: number; suspended: number }
  mandates: { active: number; pending: number; suspended: number; cancelled: number }
  contributions: {
    thisMonthTotal: number; thisMonthDue: number; thisMonthPaid: number
    thisMonthOutstanding: number; collectionRate: number; newThisMonth: number
  }
  pool: { total: number }
  invitations: { pending: number }
  recentActivity: unknown[]
  generatedAt: string
}

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
    userRepo.findMany(where, {
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
    userRepo.count(where),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function getMemberDetail(adminRoles: string[], memberId: string) {
  assertAdmin(adminRoles)

  const members = await userRepo.findMany({ id: memberId }, {
    take: 1,
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
      notificationPreference: { select: { sms: true, email: true, push: true, whatsapp: true } },
      _count: {
        select: { contributions: true, mandates: true },
      },
    },
  })
  const member = members[0] ?? null

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

  if (newStatus === 'SUSPENDED') {
    assertNotSelf(adminId, memberId, 'suspend')
  }

  const memberResults = await userRepo.findMany({ id: memberId }, {
    take: 1,
    select: { id: true, status: true },
  })
  const member = memberResults[0] ?? null
  if (!member) throw new AdminNotFoundError('Member not found')
  if (member.status === newStatus) throw new AdminConflictError(`Member is already ${newStatus}`)

  const updated = await userRepo.update(memberId, { status: newStatus }, {
    id: true, status: true, firstName: true, lastName: true,
  })

  await Promise.all([
    bumpRoleVersion(memberId),
    writeAuditLog({
      userId: adminId,
      action: 'ADMIN_MEMBER_STATUS_CHANGED',
      entity: 'User',
      entityId: memberId,
      payload: { from: member.status, to: newStatus },
      ipAddress: ip,
    }),
    cache.del(CACHE_KEYS.DASHBOARD_STATS),
  ])

  return updated
}

// ─── Mandates ─────────────────────────────────────────────────────────────────

export async function listAllMandates(adminRoles: string[], params: ListMandatesParams = {}) {
  assertAdmin(adminRoles)
  const { status, page = 1, limit = 20 } = params
  const skip = (page - 1) * limit

  const where = { ...(status && { status }) }

  const [items, total] = await Promise.all([
    mandateRepo.findMany(where, {
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
    mandateRepo.count(where),
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

  const mandate = await mandateRepo.findByIdWithSelect(mandateId, { id: true, status: true, userId: true })
  if (!mandate) throw new AdminNotFoundError('Mandate not found')
  if (mandate.status !== 'PENDING') throw new AdminConflictError('Only PENDING mandates can be approved')

  const updated = await mandateRepo.update(mandateId, { status: 'ACTIVE', approvedAt: new Date(), approvedById: adminId }, {
    select: { id: true, status: true },
  })

  await Promise.all([
    writeAuditLog({
      userId: adminId,
      action: 'ADMIN_MANDATE_APPROVED',
      entity: 'PaymentMandate',
      entityId: mandateId,
      payload: { memberId: mandate.userId, previousStatus: mandate.status },
      ipAddress: ip,
    }),
    cache.del(CACHE_KEYS.DASHBOARD_STATS),
    queueNotification({
      userId: mandate.userId,
      templateSlug: 'mandate-approved',
      channel: 'SMS',
      payload: { mandateId },
    }),
  ])

  return updated
}

/**
 * Enough of the reason to be useful in one message, cut on a word boundary.
 *
 * Three dots rather than an ellipsis character. U+2026 is outside GSM-7, and a
 * single character outside it bills the whole message as UCS-2 — halving the
 * budget for the very reason it was added to carry. The templates make this
 * point about em dashes; it applies just as much to text substituted at
 * runtime, which no template test can see.
 */
function shortenForSms(reason: string, max = 90): string {
  if (reason.length <= max) return reason
  const cut = reason.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`
}

export async function rejectMandate(
  adminId: string,
  adminRoles: string[],
  mandateId: string,
  ip?: string,
  /** Why it was refused. Told to the member, and kept in the audit trail. */
  reason?: string,
) {
  assertAdmin(adminRoles)

  const mandate = await mandateRepo.findByIdWithSelect(mandateId, {
    id: true, status: true, userId: true, netcashMandateId: true,
  })
  if (!mandate) throw new AdminNotFoundError('Mandate not found')

  if (mandate.status === 'CANCELLED') throw new AdminConflictError('Mandate is already cancelled')

  // Two different acts share this one path, and they are not the same thing.
  //
  // Turning down a request that is still waiting is a rejection. Stopping a
  // mandate that is already live is a cancellation — leadership needs both (an
  // account closes, somebody leaves, a debit order has to stop) and there is a
  // test that has always said so. What was wrong was telling the member the
  // same thing either way: that their mandate "was not approved" and they
  // should check their bank details. For a live mandate that is false twice
  // over — it had been approved, and their details were fine.
  const wasLive = mandate.status !== 'PENDING'

  const trimmedReason = reason?.trim() ?? ''
  if (trimmedReason.length < 10) {
    throw new AdminConflictError(
      'Give a reason of at least 10 characters — the member is told why, and it is recorded.',
    )
  }

  const updated = await mandateRepo.update(mandateId, { status: 'CANCELLED' }, {
    select: { id: true, status: true },
  })

  // The authorisation exists at Netcash before the local row does — the member
  // app registers it first and only then writes. Flipping the local status
  // without telling Netcash leaves the bank still holding permission to debit
  // this member while our records say it is cancelled. The member's own
  // cancellation path has always done this; rejection never did.
  if (mandate.netcashMandateId) {
    try {
      await paymentGateway.cancelMandate(mandate.netcashMandateId)
    } catch (err) {
      const failure = err instanceof Error ? err.message : String(err)
      logger.error('Mandate rejected but Netcash cancel failed — manual reconciliation required', {
        mandateId, netcashMandateId: mandate.netcashMandateId, error: failure,
      })
      await raiseGatewayDesyncAlert({
        mandateId,
        netcashMandateId: mandate.netcashMandateId,
        operation: 'cancel',
        reason: failure,
        detail: [
          'An admin stopped this mandate and the member has been told so, but the',
          'authorisation could not be cancelled at Netcash. Until it is, the bank',
          'still holds permission to debit this member. Cancel it by hand.',
        ].join(' '),
      })
    }
  }

  await Promise.all([
    writeAuditLog({
      userId: adminId,
      action: wasLive ? 'ADMIN_MANDATE_CANCELLED' : 'ADMIN_MANDATE_REJECTED',
      entity: 'PaymentMandate',
      entityId: mandateId,
      payload: { memberId: mandate.userId, previousStatus: mandate.status, reason: trimmedReason },
      ipAddress: ip,
    }),
    cache.del(CACHE_KEYS.DASHBOARD_STATS),
    queueNotification({
      userId: mandate.userId,
      templateSlug: wasLive ? 'mandate-cancelled-by-admin' : 'mandate-rejected',
      channel: 'SMS',
      // Shortened for the message rather than sent whole: a reason may run to
      // 500 characters, and one long SMS is billed as several.
      payload: { mandateId, reason: shortenForSms(trimmedReason) },
    }),
  ])

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
    contributionRepo.findMany(where, {
      skip,
      take: limit,
      orderBy: [{ createdAt: 'desc' }],
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
    contributionRepo.count(where),
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

  const members = await userRepo.findMany(statusFilter, {
    select: { id: true, email: true, phone: true, firstName: true },
  })

  const sends = members.map(async (m) => {
    const counts = { sms: 0, email: 0, failed: false }
    try {
      if ((channel === 'SMS' || channel === 'BOTH') && m.phone) {
        const phone = smsProvider.normalisePhone(m.phone)
        if (phone) {
          await smsProvider.send({ to: phone, body: message })
          counts.sms++
        }
      }
      if ((channel === 'EMAIL' || channel === 'BOTH') && m.email) {
        await emailProvider.sendGenericEmail(
          m.email,
          'Message from Xkimi Xa Mali Foundation',
          `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;"><p style="color:#374151;margin-bottom:24px;">Hi ${escapeHtml(m.firstName)},</p><p style="color:#374151;margin-bottom:24px;white-space:pre-wrap;">${escapeHtml(message)}</p><p style="color:#9CA3AF;font-size:12px;">Xkimi Xa Mali Foundation · "Blessed is the hand that giveth."</p></div>`,
        )
        counts.email++
      }
    } catch {
      counts.failed = true
    }
    return counts
  })

  const results = await Promise.all(sends)
  const smsSent   = results.reduce((n, r) => n + r.sms, 0)
  const emailSent = results.reduce((n, r) => n + r.email, 0)
  const failed    = results.filter((r) => r.failed).length

  // In-app: a free, instant message that lands in each member's inbox.
  let inAppSent = 0
  if (channel === 'IN_APP') {
    inAppSent = await createInboxMessages(members.map((m) => m.id), {
      title: 'Message from Xkimi Xa Mali Foundation',
      body: message,
      category: 'BROADCAST',
      createdById: adminId,
    })
  }

  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_BROADCAST_SENT',
    entity: 'Notification',
    entityId: adminId,
    payload: { channel, filter, total: members.length, smsSent, emailSent, inAppSent, failed },
    ipAddress: ip,
  })

  return { total: members.length, smsSent, emailSent, inAppSent, failed }
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
    auditRepo.findMany(where, {
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
    auditRepo.count(where),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

// ─── Dashboard stats ──────────────────────────────────────────────────────────

export async function getDashboardStats(adminRoles: string[]) {
  assertAdmin(adminRoles)

  const cached = await cache.get<DashboardStats>(CACHE_KEYS.DASHBOARD_STATS)
  if (cached) return cached

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
    newContributionsThisMonth,
  ] = await Promise.all([
    // Member counts by status
    userRepo.groupBy({ by: ['status'], _count: { status: true } }),

    // Mandate counts by status
    mandateRepo.groupBy({ by: ['status'], _count: { status: true } }),

    // This month's contribution stats
    contributionRepo.aggregate(
      { periodMonth: thisMonth, periodYear: thisYear },
      { _count: { id: true }, _sum: { amountDue: true, amountPaid: true } },
    ),

    // Last 10 audit events for the activity feed
    auditRepo.findMany({}, {
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
    contributionRepo.aggregate(
      { status: 'PAID' },
      { _sum: { amountPaid: true } },
    ),

    // Open invitation count
    invitationRepo.count({ status: 'PENDING', expiresAt: { gt: now } }),

    // Contributions received this calendar month
    contributionRepo.count({ createdAt: { gte: monthStart } }),
  ])

  const memberMap = tallyBy(memberCounts, (r: { status: string; _count: unknown }) => r.status, 'status')
  const mandateMap = tallyBy(mandateCounts, (r: { status: string; _count: unknown }) => r.status, 'status')

  const thisMonthDue = Number(contributionSummary._sum?.amountDue ?? 0)
  const thisMonthPaid = Number(contributionSummary._sum?.amountPaid ?? 0)

  const stats: DashboardStats = {
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
      thisMonthTotal: contributionSummary._count?.id ?? 0,
      thisMonthDue,
      thisMonthPaid,
      thisMonthOutstanding: subtractZAR(thisMonthDue, thisMonthPaid),
      collectionRate:
        thisMonthDue > 0 ? Math.round((thisMonthPaid / thisMonthDue) * 100) : 0,
      newThisMonth: newContributionsThisMonth,
    },
    pool: {
      total: Number(poolTotal._sum?.amountPaid ?? 0),
    },
    invitations: {
      pending: pendingInvites,
    },
    recentActivity: recentAuditLogs,
    generatedAt: now.toISOString(),
  }

  await cache.set(CACHE_KEYS.DASHBOARD_STATS, stats, CACHE_KEYS.DASHBOARD_STATS_TTL)
  return stats
}

// ─── Goals (admin read + force-expire) ───────────────────────────────────────

export async function listAllGoals(adminRoles: string[], page = 1, limit = 20) {
  assertAdmin(adminRoles)
  const skip = (page - 1) * limit

  const [items, total] = await Promise.all([
    goalRepo.findMany({}, {
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
    goalRepo.count(),
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

  const memberResults = await userRepo.findMany({ id: memberId }, {
    take: 1,
    select: { id: true, loginAttempts: true, lockedUntil: true },
  })
  const member = memberResults[0] ?? null
  if (!member) throw new AdminNotFoundError('Member not found')

  await userRepo.update(memberId, { loginAttempts: 0, lockedUntil: null })

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

  const memberResults = await userRepo.findMany({ id: memberId }, {
    take: 1,
    select: { id: true },
  })
  if (!memberResults[0]) throw new AdminNotFoundError('Member not found')

  const skip = (page - 1) * limit
  const [items, total] = await Promise.all([
    userRepo.findLoginHistory(
      { userId: memberId },
      {
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: { id: true, success: true, ipAddress: true, userAgent: true, createdAt: true },
      },
    ),
    userRepo.countLoginHistory({ userId: memberId }),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

/**
 * Correct the ID number held against a member.
 *
 * There was no way to do this at all — not for the member, whose profile
 * schema does not include it, and not for an admin, whose service never
 * touched it. The number was typed once at registration, optionally, and
 * whatever arrived was held forever. A missing one could never be supplied, a
 * mistyped one never fixed, on the field that ties a bank account to a person.
 *
 * It lives here rather than in the console because the encryption keyring does.
 * The console has no business holding that key to change one column.
 */
export async function correctMemberIdNumber(
  adminId: string,
  adminRoles: string[],
  memberId: string,
  idNumber: string,
  reason: string,
  ip?: string,
) {
  assertAdmin(adminRoles)

  const trimmed = idNumber.trim()
  if (!isValidSAId(trimmed)) {
    throw new AdminConflictError('That is not a valid SA ID number — check the digits')
  }

  const trimmedReason = reason?.trim() ?? ''
  if (trimmedReason.length < 10) {
    throw new AdminConflictError(
      'Give a reason of at least 10 characters — it is recorded against your name',
    )
  }

  const member = await userRepo.findById(memberId, { select: { id: true, idNumber: true } })
  if (!member) throw new AdminNotFoundError('Member not found')

  await userRepo.update(memberId, { idNumber: encrypt(trimmed) })

  // The number is never written to the audit trail. Encrypting it at rest and
  // then printing it into an append-only log would undo the point. What is
  // recorded is that it changed, whether there was one before, and why.
  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_MEMBER_ID_CORRECTED',
    entity: 'User',
    entityId: memberId,
    payload: { hadPreviousValue: member.idNumber !== null, reason: trimmedReason },
    ipAddress: ip,
  })

  return { corrected: true as const }
}
