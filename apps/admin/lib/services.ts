import { db, Prisma } from '@/lib/db'

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
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
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
      notificationPreference: { select: { sms: true, email: true, push: true } },
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
    data: { status: newStatus as 'ACTIVE' | 'PENDING' | 'SUSPENDED' },
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
  const where = { ...(status && { status }) }

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
    where: { id: mandateId }, data: { status: 'ACTIVE' }, select: { id: true, status: true },
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
    ...(status && { status: status as Prisma.EnumContributionStatusFilter }),
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
  const [progress] = await db.$transaction([
    db.goalProgress.create({ data: { goalId, amount } }),
    db.goal.update({
      where: { id: goalId },
      data: {
        currentAmount: newTotal,
        ...(newTotal >= Number(goal.targetAmount) && { status: 'ACHIEVED' }),
      },
    }),
  ])
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
