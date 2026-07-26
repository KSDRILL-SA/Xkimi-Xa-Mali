import { db } from '@/lib/db'
import { assertAdmin, writeAuditLog, AdminNotFoundError, AdminConflictError } from './shared'

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
