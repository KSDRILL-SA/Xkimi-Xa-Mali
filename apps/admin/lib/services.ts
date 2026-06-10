import { createHash } from 'crypto'
import { ContributionStatus, MandateStatus, UserStatus, BadgeTier, type AdminSignature } from '@prisma/client'
import { db, Prisma } from '@/lib/db'
import { storeSignaturePng } from '@/lib/signature-storage'

// ─── Errors ───────────────────────────────────────────────────────────────────

export class AdminForbiddenError extends Error {
  code = 'SYS_003'; status = 403
  constructor() { super('Admin access required') }
}
export class AdminNotFoundError extends Error {
  code = 'ADM_001'; status = 404
  constructor(msg = 'Resource not found') { super(msg) }
}
export class AdminConflictError extends Error {
  code = 'ADM_002'; status = 409
  constructor(msg: string) { super(msg) }
}
export class SignatureLockError extends Error {
  code = 'SIG_002'; status = 423
  nextChangeAllowedAt: string
  constructor(nextChangeAllowedAt: Date) {
    super('Signature can only be changed once every 90 days')
    this.nextChangeAllowedAt = nextChangeAllowedAt.toISOString()
  }
}

function assertAdmin(roles: string[]) {
  if (!roles.includes('ADMIN')) throw new AdminForbiddenError()
}

// ─── Audit helper ─────────────────────────────────────────────────────────────

async function writeAuditLog(data: {
  userId?: string | null
  action: string
  entity: string
  entityId: string
  payload?: unknown
  ipAddress?: string | null
}) {
  await db.auditLog.create({
    data: {
      userId:    data.userId ?? null,
      action:    data.action,
      entity:    data.entity,
      entityId:  data.entityId,
      payload:   (data.payload ?? {}) as Prisma.InputJsonValue,
      ipAddress: data.ipAddress ?? null,
    },
  })
}

// ─── Members ──────────────────────────────────────────────────────────────────

export async function listMembers(
  adminRoles: string[],
  params: { search?: string; status?: string; page?: number; limit?: number } = {},
) {
  assertAdmin(adminRoles)
  const { search, status, page = 1, limit = 25 } = params
  const skip = (page - 1) * limit

  const searchFilter: Prisma.UserWhereInput = search ? {
    OR: [
      { firstName: { contains: search, mode: 'insensitive' as const } },
      { lastName:  { contains: search, mode: 'insensitive' as const } },
      { email:     { contains: search, mode: 'insensitive' as const } },
      { phone:     { contains: search, mode: 'insensitive' as const } },
    ],
  } : {}

  const where: Prisma.UserWhereInput = {
    ...searchFilter,
    ...(status && { status: status as UserStatus }),
  }

  const [items, total, statusGroups] = await Promise.all([
    db.user.findMany({
      where, skip, take: limit,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true, firstName: true, lastName: true, email: true,
        phone: true, status: true, createdAt: true,
        roles: { select: { role: true } },
        _count: { select: { contributions: true, mandates: true } },
      },
    }),
    db.user.count({ where }),
    db.user.groupBy({ by: ['status'], where: searchFilter, _count: true }),
  ])

  const statusCounts: Record<UserStatus, number> = { ACTIVE: 0, PENDING: 0, SUSPENDED: 0 }
  for (const g of statusGroups) statusCounts[g.status] = g._count

  return { items, total, page, limit, totalPages: Math.ceil(total / limit), statusCounts }
}

export async function getMemberDetail(adminRoles: string[], memberId: string) {
  assertAdmin(adminRoles)

  const member = await db.user.findUnique({
    where: { id: memberId },
    select: {
      id: true, firstName: true, lastName: true, email: true,
      phone: true, status: true, createdAt: true, updatedAt: true,
      popiaConsentAt: true, loginAttempts: true, lockedUntil: true,
      roles:      { select: { role: true } },
      bankAccounts: { select: { id: true, bankName: true, accountType: true, createdAt: true } },
      mandates: {
        orderBy: { createdAt: 'desc' }, take: 5,
        select: { id: true, status: true, amount: true, debitDay: true, createdAt: true },
      },
      contributions: {
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }], take: 12,
        select: { id: true, periodMonth: true, periodYear: true, amountDue: true, amountPaid: true, status: true },
      },
      notificationPreference: { select: { sms: true, email: true, push: true, whatsapp: true } },
      _count: { select: { contributions: true, mandates: true } },
    },
  })

  if (!member) throw new AdminNotFoundError('Member not found')
  return member
}

export async function setMemberStatus(
  adminId: string, adminRoles: string[],
  memberId: string, newStatus: string, ip?: string,
) {
  assertAdmin(adminRoles)
  const member = await db.user.findUnique({ where: { id: memberId }, select: { id: true, status: true } })
  if (!member) throw new AdminNotFoundError('Member not found')
  if (member.status === newStatus) throw new AdminConflictError(`Member is already ${newStatus}`)

  const updated = await db.user.update({
    where: { id: memberId },
    data: { status: newStatus as 'ACTIVE' | 'PENDING' | 'SUSPENDED', roleVersion: { increment: 1 } },
    select: { id: true, status: true, firstName: true, lastName: true },
  })

  await writeAuditLog({
    userId: adminId, action: 'ADMIN_MEMBER_STATUS_CHANGED',
    entity: 'User', entityId: memberId,
    payload: { from: member.status, to: newStatus }, ipAddress: ip,
  })

  return updated
}

export async function unlockMember(
  adminId: string, adminRoles: string[],
  memberId: string, ip?: string,
) {
  assertAdmin(adminRoles)
  const member = await db.user.findUnique({ where: { id: memberId }, select: { id: true, lockedUntil: true, loginAttempts: true } })
  if (!member) throw new AdminNotFoundError('Member not found')

  const updated = await db.user.update({
    where: { id: memberId },
    data: { lockedUntil: null, loginAttempts: 0 },
    select: { id: true, lockedUntil: true, loginAttempts: true },
  })

  await writeAuditLog({
    userId: adminId, action: 'ADMIN_MEMBER_UNLOCKED',
    entity: 'User', entityId: memberId,
    payload: { previousLockedUntil: member.lockedUntil, previousAttempts: member.loginAttempts },
    ipAddress: ip,
  })

  return updated
}

// ─── Mandates ─────────────────────────────────────────────────────────────────

export async function listAllMandates(
  adminRoles: string[],
  params: { status?: string; page?: number; limit?: number } = {},
) {
  assertAdmin(adminRoles)
  const { status, page = 1, limit = 20 } = params
  const skip = (page - 1) * limit
  const where: Prisma.PaymentMandateWhereInput = {
    ...(status && { status: status as MandateStatus }),
  }

  const [items, total] = await Promise.all([
    db.paymentMandate.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' },
      select: {
        id: true, status: true, amount: true, debitDay: true,
        createdAt: true, netcashMandateId: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        bankAccount: { select: { bankName: true, accountType: true } },
      },
    }),
    db.paymentMandate.count({ where }),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function approveMandate(
  adminId: string, adminRoles: string[], mandateId: string, ip?: string,
) {
  assertAdmin(adminRoles)
  const mandate = await db.paymentMandate.findUnique({ where: { id: mandateId }, select: { id: true, status: true, userId: true } })
  if (!mandate) throw new AdminNotFoundError('Mandate not found')
  if (mandate.status !== 'PENDING') throw new AdminConflictError('Only PENDING mandates can be approved')

  const updated = await db.paymentMandate.update({
    where: { id: mandateId }, data: { status: 'ACTIVE', approvedAt: new Date(), approvedById: adminId }, select: { id: true, status: true },
  })
  await writeAuditLog({ userId: adminId, action: 'ADMIN_MANDATE_APPROVED', entity: 'PaymentMandate', entityId: mandateId, payload: { memberId: mandate.userId }, ipAddress: ip })
  return updated
}

export async function rejectMandate(
  adminId: string, adminRoles: string[], mandateId: string, ip?: string,
) {
  assertAdmin(adminRoles)
  const mandate = await db.paymentMandate.findUnique({ where: { id: mandateId }, select: { id: true, status: true, userId: true } })
  if (!mandate) throw new AdminNotFoundError('Mandate not found')
  if (mandate.status === 'CANCELLED') throw new AdminConflictError('Mandate is already cancelled')

  const updated = await db.paymentMandate.update({
    where: { id: mandateId }, data: { status: 'CANCELLED' }, select: { id: true, status: true },
  })
  await writeAuditLog({ userId: adminId, action: 'ADMIN_MANDATE_REJECTED', entity: 'PaymentMandate', entityId: mandateId, payload: { memberId: mandate.userId }, ipAddress: ip })
  return updated
}

// ─── Contributions ────────────────────────────────────────────────────────────

export async function listAllContributions(
  adminRoles: string[],
  params: { month: number; year: number; status?: string; page?: number; limit?: number },
) {
  assertAdmin(adminRoles)
  const { month, year, status, page = 1, limit = 20 } = params
  const skip = (page - 1) * limit

  const where: Prisma.ContributionWhereInput = {
    periodMonth: month, periodYear: year,
    ...(status && { status: status as ContributionStatus }),
  }

  const [items, total] = await Promise.all([
    db.contribution.findMany({
      where, skip, take: limit, orderBy: { createdAt: 'desc' },
      select: {
        id: true, periodMonth: true, periodYear: true,
        amountDue: true, amountPaid: true, status: true, createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
    db.contribution.count({ where }),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function generateContributions(
  adminId: string, adminRoles: string[],
  month: number, year: number,
) {
  assertAdmin(adminRoles)

  const mandates = await db.paymentMandate.findMany({
    where: { status: MandateStatus.ACTIVE, user: { status: UserStatus.ACTIVE } },
    select: { userId: true, debitDay: true, amount: true },
  })

  const existing = await db.contribution.findMany({
    where: {
      userId: { in: mandates.map((m) => m.userId) },
      periodMonth: month, periodYear: year,
    },
    select: { userId: true },
  })
  const alreadyHas = new Set(existing.map((c) => c.userId))
  const toCreate = mandates.filter((m) => !alreadyHas.has(m.userId))

  if (toCreate.length > 0) {
    await db.contribution.createMany({
      data: toCreate.map((m) => ({
        userId: m.userId,
        periodMonth: month,
        periodYear: year,
        amountDue: m.amount,
        amountPaid: 0,
        dueDate: new Date(year, month - 1, m.debitDay),
        status: ContributionStatus.PENDING,
      })),
      skipDuplicates: true,
    })
  }

  const created = toCreate.length
  const skipped = mandates.length - toCreate.length

  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_CONTRIBUTIONS_GENERATED',
    entity: 'Contribution',
    entityId: `${year}-${month}`,
    payload: { month, year, created, skipped, total: mandates.length },
  })

  return { created, skipped, total: mandates.length }
}

// ─── Goals ────────────────────────────────────────────────────────────────────

export async function listAllGoals(adminRoles: string[], page = 1, limit = 20) {
  assertAdmin(adminRoles)
  const skip = (page - 1) * limit
  const [items, total] = await Promise.all([
    db.goal.findMany({
      skip, take: limit, orderBy: { createdAt: 'desc' },
      select: { id: true, title: true, type: true, status: true, targetAmount: true, currentAmount: true, deadline: true, lockedAt: true, createdAt: true },
    }),
    db.goal.count(),
  ])
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function createGoal(
  adminId: string, adminRoles: string[],
  data: { title: string; description?: string; type: string; targetAmount: number; deadline: string },
) {
  assertAdmin(adminRoles)
  const goal = await db.goal.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      type: data.type as 'MONTHLY' | 'YEARLY' | 'CUSTOM',
      targetAmount: data.targetAmount,
      currentAmount: 0,
      deadline: new Date(data.deadline),
      status: 'DRAFT',
      createdById: adminId,
    },
  })
  await writeAuditLog({ userId: adminId, action: 'GOAL_CREATED', entity: 'Goal', entityId: goal.id, payload: data })
  return goal
}

export async function activateGoal(adminId: string, adminRoles: string[], goalId: string) {
  assertAdmin(adminRoles)
  const goal = await db.goal.findUnique({ where: { id: goalId } })
  if (!goal) throw new AdminNotFoundError('Goal not found')
  if (goal.status !== 'DRAFT') throw new AdminConflictError('Only DRAFT goals can be activated')
  const updated = await db.goal.update({ where: { id: goalId }, data: { status: 'ACTIVE' } })
  await writeAuditLog({ userId: adminId, action: 'GOAL_ACTIVATED', entity: 'Goal', entityId: goalId, payload: { title: goal.title } })
  return updated
}

export async function lockGoal(adminId: string, adminRoles: string[], goalId: string) {
  assertAdmin(adminRoles)
  const goal = await db.goal.findUnique({ where: { id: goalId } })
  if (!goal) throw new AdminNotFoundError('Goal not found')
  if (goal.lockedAt) throw new AdminConflictError('Goal is already locked')
  if (goal.status === 'DRAFT') throw new AdminConflictError('Activate the goal before locking it')
  const updated = await db.goal.update({
    where: { id: goalId },
    data: { lockedAt: new Date(), lockedById: adminId },
  })
  await writeAuditLog({ userId: adminId, action: 'GOAL_LOCKED', entity: 'Goal', entityId: goalId, payload: { title: goal.title } })
  return updated
}

export async function deleteGoal(adminId: string, adminRoles: string[], goalId: string) {
  assertAdmin(adminRoles)
  const goal = await db.goal.findUnique({ where: { id: goalId } })
  if (!goal) throw new AdminNotFoundError('Goal not found')
  if (goal.status !== 'DRAFT') throw new AdminConflictError('Only DRAFT goals can be deleted')
  await db.goal.delete({ where: { id: goalId } })
  await writeAuditLog({ userId: adminId, action: 'GOAL_DELETED', entity: 'Goal', entityId: goalId, payload: { title: goal.title } })
}

export async function recordGoalProgress(
  adminId: string, adminRoles: string[], goalId: string, amount: number, note?: string,
) {
  assertAdmin(adminRoles)
  const goal = await db.goal.findUnique({ where: { id: goalId } })
  if (!goal) throw new AdminNotFoundError('Goal not found')
  if (goal.status !== 'ACTIVE') throw new AdminConflictError('Progress can only be recorded on ACTIVE goals')
  const newTotal = Number(goal.currentAmount) + amount
  const goalVersion = (goal as typeof goal & { version: number }).version
  const progress = await db.$transaction(async (tx) => {
    const record = await tx.goalProgress.create({ data: { goalId, amount, note: note ?? null, recordedById: adminId } })
    const updated = await tx.goal.updateMany({
      where: { id: goalId, version: goalVersion },
      data: {
        currentAmount: newTotal,
        version: goalVersion + 1,
        ...(newTotal >= Number(goal.targetAmount) && { status: 'ACHIEVED' }),
      },
    })
    if (updated.count === 0) throw new AdminConflictError('Concurrent modification detected — retry required')
    return record
  })
  await writeAuditLog({ userId: adminId, action: 'GOAL_PROGRESS_RECORDED', entity: 'Goal', entityId: goalId, payload: { amount, newTotal, note } })
  return { id: progress.id, amount: Number(progress.amount), newTotal, achieved: newTotal >= Number(goal.targetAmount) }
}

// ─── Audit ────────────────────────────────────────────────────────────────────

export async function listAuditLogs(
  adminRoles: string[],
  params: { entity?: string; action?: string; userId?: string; page?: number; limit?: number } = {},
) {
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
      where, skip, take: limit, orderBy: { createdAt: 'desc' },
      select: {
        id: true, action: true, entity: true, entityId: true,
        payload: true, ipAddress: true, createdAt: true,
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    }),
    db.auditLog.count({ where }),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

// ─── Invitations ──────────────────────────────────────────────────────────────

export async function listInvitations(adminRoles: string[], page = 1, limit = 20) {
  assertAdmin(adminRoles)
  const skip = (page - 1) * limit
  const [items, total] = await Promise.all([
    db.invitation.findMany({
      skip, take: limit, orderBy: { createdAt: 'desc' },
      select: {
        id: true, firstName: true, lastName: true, email: true,
        phone: true, status: true, codePrefix: true, minimumAmount: true,
        expiresAt: true, acceptedAt: true, createdAt: true,
      },
    }),
    db.invitation.count(),
  ])
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function revokeInvitation(
  adminId: string, adminRoles: string[],
  invitationId: string, ip?: string,
) {
  assertAdmin(adminRoles)
  const invite = await db.invitation.findUnique({ where: { id: invitationId }, select: { id: true, status: true, email: true } })
  if (!invite) throw new AdminNotFoundError('Invitation not found')
  if (invite.status !== 'PENDING') throw new AdminConflictError(`Invitation is already ${invite.status}`)

  await db.invitation.update({
    where: { id: invitationId },
    data: { status: 'REVOKED', revokedById: adminId, revokedAt: new Date() },
  })

  await writeAuditLog({
    userId: adminId, action: 'ADMIN_INVITATION_REVOKED',
    entity: 'Invitation', entityId: invitationId,
    payload: { email: invite.email }, ipAddress: ip,
  })
}

export async function setMemberRole(
  adminId: string, adminRoles: string[],
  memberId: string, role: 'ADMIN' | 'MEMBER', assign: boolean, ip?: string,
) {
  assertAdmin(adminRoles)
  const roleRecord = await db.role.findUnique({ where: { name: role } })
  if (!roleRecord) throw new AdminNotFoundError(`Role ${role} not found`)

  const member = await db.user.findUnique({ where: { id: memberId }, select: { id: true } })
  if (!member) throw new AdminNotFoundError('Member not found')

  if (assign) {
    await db.userRole.upsert({
      where: { userId_roleId: { userId: memberId, roleId: roleRecord.id } },
      create: { userId: memberId, roleId: roleRecord.id },
      update: {},
    })
  } else {
    await db.userRole.deleteMany({ where: { userId: memberId, roleId: roleRecord.id } })
  }

  await Promise.all([
    db.user.update({ where: { id: memberId }, data: { roleVersion: { increment: 1 } } }),
    writeAuditLog({
      userId: adminId, action: assign ? 'ADMIN_ROLE_ASSIGNED' : 'ADMIN_ROLE_REMOVED',
      entity: 'User', entityId: memberId,
      payload: { role, assign }, ipAddress: ip,
    }),
  ])

  return { memberId, role, assigned: assign }
}

export async function getMemberLoginHistory(
  adminRoles: string[], memberId: string, page = 1, limit = 20,
) {
  assertAdmin(adminRoles)
  const skip = (page - 1) * limit

  const [items, total] = await Promise.all([
    db.loginHistory.findMany({
      where: { userId: memberId },
      skip, take: limit,
      orderBy: { createdAt: 'desc' },
      select: { id: true, ipAddress: true, userAgent: true, success: true, createdAt: true },
    }),
    db.loginHistory.count({ where: { userId: memberId } }),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

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

// ─── Signature ────────────────────────────────────────────────────────────────

const SIGNATURE_LOCK_DAYS = 90
const SIGNATURE_LOCK_DURATION_MS = SIGNATURE_LOCK_DAYS * 24 * 60 * 60 * 1000

function serializeSignature(signature: AdminSignature) {
  return {
    id: signature.id,
    displayName: signature.displayName,
    isActive: signature.isActive,
    nextChangeAllowedAt: signature.nextChangeAllowedAt.toISOString(),
    canChangeNow: signature.nextChangeAllowedAt.getTime() <= Date.now(),
    createdAt: signature.createdAt.toISOString(),
    updatedAt: signature.updatedAt.toISOString(),
  }
}

/** Current admin's signature metadata for the settings page (no blob URL). */
export async function getSignatureMetadata(adminId: string, adminRoles: string[]) {
  assertAdmin(adminRoles)
  const signature = await db.adminSignature.findUnique({ where: { adminId } })
  return signature ? serializeSignature(signature) : null
}

/** Whether (and when) the admin may next change their signature. */
export async function getLockStatus(adminId: string, adminRoles: string[]) {
  assertAdmin(adminRoles)
  const signature = await db.adminSignature.findUnique({ where: { adminId } })
  if (!signature) return { canChange: true, nextChangeAllowedAt: null }
  return {
    canChange: signature.nextChangeAllowedAt.getTime() <= Date.now(),
    nextChangeAllowedAt: signature.nextChangeAllowedAt.toISOString(),
  }
}

/** The admin's signature change history, most recent first. */
export async function getSignatureHistory(adminId: string, adminRoles: string[]) {
  assertAdmin(adminRoles)
  const history = await db.adminSignatureHistory.findMany({
    where: { adminId }, orderBy: { replacedAt: 'desc' },
  })
  return history.map((entry) => ({
    id: entry.id,
    signatureUrl: entry.signatureUrl,
    replacedAt: entry.replacedAt.toISOString(),
  }))
}

/** Upload the admin's first signature. */
export async function createSignature(
  adminId: string, adminRoles: string[], pngBuffer: Buffer, displayName: string,
) {
  assertAdmin(adminRoles)

  const existing = await db.adminSignature.findUnique({ where: { adminId } })
  if (existing) throw new AdminConflictError('Signature already exists — use update instead')

  const signatureHash = createHash('sha256').update(pngBuffer).digest('hex')
  const path = `signatures/${adminId}/${Date.now()}.png`
  const signatureUrl = await storeSignaturePng(path, pngBuffer)

  const signature = await db.adminSignature.create({
    data: {
      adminId,
      signatureUrl,
      signatureHash,
      displayName,
      isActive: true,
      nextChangeAllowedAt: new Date(Date.now() + SIGNATURE_LOCK_DURATION_MS),
    },
  })

  await writeAuditLog({
    userId: adminId, action: 'SIGNATURE_CREATED', entity: 'AdminSignature', entityId: signature.id,
    payload: { displayName },
  })

  return serializeSignature(signature)
}

/** Replace the admin's signature once the 90-day lock window has elapsed. */
export async function updateSignature(
  adminId: string, adminRoles: string[], pngBuffer: Buffer, displayName: string,
) {
  assertAdmin(adminRoles)

  const existing = await db.adminSignature.findUnique({ where: { adminId } })
  if (!existing) throw new AdminNotFoundError('No signature on file — upload one first')
  if (existing.nextChangeAllowedAt.getTime() > Date.now()) {
    throw new SignatureLockError(existing.nextChangeAllowedAt)
  }

  const signatureHash = createHash('sha256').update(pngBuffer).digest('hex')
  const path = `signatures/${adminId}/${Date.now()}.png`
  const signatureUrl = await storeSignaturePng(path, pngBuffer)

  const signature = await db.$transaction(async (tx) => {
    await tx.adminSignatureHistory.create({
      data: {
        adminId,
        signatureUrl: existing.signatureUrl,
        signatureHash: existing.signatureHash,
        replacedById: adminId,
      },
    })

    return tx.adminSignature.update({
      where: { adminId },
      data: {
        signatureUrl,
        signatureHash,
        displayName,
        nextChangeAllowedAt: new Date(Date.now() + SIGNATURE_LOCK_DURATION_MS),
      },
    })
  })

  await writeAuditLog({
    userId: adminId, action: 'SIGNATURE_UPDATED', entity: 'AdminSignature', entityId: signature.id,
    payload: { displayName },
  })

  return serializeSignature(signature)
}
