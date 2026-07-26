import { UserStatus } from '@prisma/client'
import { db, Prisma } from '@/lib/db'
import { assertAdmin, notifyInbox, writeAuditLog, AdminNotFoundError, AdminConflictError } from './shared'

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

  // Soft-deleted members are excluded, matching what both login paths and
  // findAllActiveUserIds already do. Nothing sets User.deletedAt today — there
  // is no erasure feature yet — so this changes no current behaviour. It is here
  // because the day one is added, a member who asked to be forgotten would
  // otherwise still appear by name, email and phone in this list and be counted
  // in the totals beneath it, which is precisely the request they made.
  const where: Prisma.UserWhereInput = {
    ...searchFilter,
    ...(status && { status: status as UserStatus }),
    deletedAt: null,
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
    // searchFilter rather than `where`, so the tallies span every status rather
    // than only the one being filtered on — but still excluding deleted members,
    // or the counts above the list would disagree with the list itself.
    db.user.groupBy({ by: ['status'], where: { ...searchFilter, deletedAt: null }, _count: true }),
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

  if (newStatus === 'ACTIVE') {
    await notifyInbox({
      userId: memberId, createdById: adminId, category: 'SYSTEM',
      title: 'Welcome — your membership is active 🎉',
      body: 'Your account is now active. Set up your payment mandate to start contributing with the brotherhood.',
    })
  }

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
