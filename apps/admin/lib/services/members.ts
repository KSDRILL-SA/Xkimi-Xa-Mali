import { UserStatus } from '@prisma/client'
import {
  refuseStatusChange,
  STATUS_CHANGE_REFUSAL_MESSAGE,
  type AdminSettableStatus,
} from '@xxm/utils/status-policy'
import { db, Prisma } from '@/lib/db'
import { publishRoleVersion } from '@/lib/role-version'
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
        // So the list can show who holds the Founder badge without opening each
        // member. At most four rows across the whole table.
        distinctions: { select: { kind: true } },
        _count: { select: { contributions: true, mandates: true } },
      },
    }),
    db.user.count({ where }),
    // searchFilter rather than `where`, so the tallies span every status rather
    // than only the one being filtered on — but still excluding deleted members,
    // or the counts above the list would disagree with the list itself.
    db.user.groupBy({ by: ['status'], where: { ...searchFilter, deletedAt: null }, _count: true }),
  ])

  // Typed as a total Record on purpose: adding a UserStatus without counting it
  // is a compile error rather than a tally that silently omits a whole group.
  const statusCounts: Record<UserStatus, number> = { ACTIVE: 0, PENDING: 0, SUSPENDED: 0, RESIGNED: 0 }
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
      // Conferred, never earned — a separate table the badge score knows
      // nothing about. See docs/founder-badge-plan.md.
      distinctions: { select: { kind: true, grantedAt: true, grantedById: true, note: true } },
      _count: { select: { contributions: true, mandates: true } },
    },
  })

  if (!member) throw new AdminNotFoundError('Member not found')
  return member
}

export async function setMemberStatus(
  adminId: string, adminRoles: string[],
  memberId: string, newStatus: string, ip?: string,
  /**
   * Why, when access is being taken away.
   *
   * Required for suspension and ignored otherwise. The reversal route already
   * holds this line for money — "a reversing entry with no stated cause is a
   * hole in that history" — and cutting a member off is no smaller an act. The
   * audit recorded from and to, which says what changed and nothing about why.
   */
  reason?: string,
) {
  assertAdmin(adminRoles)
  const member = await db.user.findUnique({
    where: { id: memberId },
    select: { id: true, status: true, roles: { select: { role: { select: { name: true } } } } },
  })
  if (!member) throw new AdminNotFoundError('Member not found')
  if (member.status === newStatus) throw new AdminConflictError(`Member is already ${newStatus}`)

  const targetIsAdmin = member.roles.some((r) => r.role.name === 'ADMIN')

  // Admins who could still undo this. Counted only when it could matter, so the
  // ordinary case does not pay for a query about a rule it cannot trip.
  const activeAdminCount = targetIsAdmin && newStatus === 'SUSPENDED'
    ? await db.user.count({
        where: { status: 'ACTIVE', deletedAt: null, roles: { some: { role: { name: 'ADMIN' } } } },
      })
    : 0

  // The status arrives from a form field. The dropdown offers three values, but
  // the server is not entitled to assume the client sent one of them — and one
  // of the values it does not offer, RESIGNED, would record that a member chose
  // to leave when leadership removed them.
  const refusal = refuseStatusChange({
    actorId: adminId,
    targetId: memberId,
    requestedStatus: newStatus,
    targetIsAdmin,
    activeAdminCount,
  })
  if (refusal) throw new AdminConflictError(STATUS_CHANGE_REFUSAL_MESSAGE[refusal])

  const trimmedReason = reason?.trim() ?? ''
  if (newStatus === 'SUSPENDED' && trimmedReason.length < 10) {
    throw new AdminConflictError(
      'Give a reason of at least 10 characters for suspending this member — it is recorded in the audit trail.',
    )
  }

  const updated = await db.user.update({
    where: { id: memberId },
    data: { status: newStatus as AdminSettableStatus, roleVersion: { increment: 1 } },
    select: { id: true, status: true, firstName: true, lastName: true, roleVersion: true },
  })

  // The member portal's Edge middleware reads this value from Redis. Publishing
  // after the database write makes suspension/reactivation invalidate an
  // already-issued JWT rather than waiting for its normal expiry.
  await publishRoleVersion(updated.id, updated.roleVersion)

  await writeAuditLog({
    userId: adminId, action: 'ADMIN_MEMBER_STATUS_CHANGED',
    entity: 'User', entityId: memberId,
    payload: {
      from: member.status,
      to: newStatus,
      ...(trimmedReason && { reason: trimmedReason }),
    },
    ipAddress: ip,
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
