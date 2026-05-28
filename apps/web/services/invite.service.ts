import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { sendInviteEmail } from '@/lib/email'
import { writeAuditLog } from './audit.service'
import { encrypt } from '@/lib/encryption'

const INVITE_TTL_HOURS = 72
const BCRYPT_ROUNDS    = 12

// ─── Domain errors ────────────────────────────────────────────────────────────

export class InviteForbiddenError extends Error {
  code = 'SYS_003'; status = 403
  constructor() { super('Admin access required') }
}
export class InviteNotFoundError extends Error {
  code = 'INV_001'; status = 404
  constructor() { super('Invite not found or already used') }
}
export class InviteExpiredError extends Error {
  code = 'INV_002'; status = 410
  constructor() { super('Invite has expired') }
}
export class InviteAlreadyAcceptedError extends Error {
  code = 'INV_003'; status = 409
  constructor() { super('Invite has already been accepted') }
}
export class InviteDuplicateEmailError extends Error {
  code = 'INV_004'; status = 409
  constructor() { super('An account with this email already exists') }
}
export class RoleForbiddenError extends Error {
  code = 'SYS_003'; status = 403
  constructor() { super('Admin access required') }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function assertAdmin(roles: string[]) {
  if (!roles.includes('ADMIN')) throw new InviteForbiddenError()
}

// ─── Invites ─────────────────────────────────────────────────────────────────

export async function createInvite(
  adminId: string,
  adminRoles: string[],
  email: string,
  baseUrl: string,
  ip?: string,
) {
  assertAdmin(adminRoles)

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (existing) throw new InviteDuplicateEmailError()

  const rawToken = generateToken()
  const tokenHash = hashToken(rawToken)
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000)

  await db.invite.create({
    data: { email, tokenHash, invitedById: adminId, expiresAt },
  })

  const inviteUrl = `${baseUrl}/invite/${rawToken}`
  await sendInviteEmail(email, inviteUrl, INVITE_TTL_HOURS)

  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_INVITE_CREATED',
    entity: 'Invite',
    entityId: email,
    payload: { email, expiresAt },
    ipAddress: ip,
  })

  return { email, expiresAt }
}

export async function listInvites(adminRoles: string[], page = 1, limit = 20) {
  assertAdmin(adminRoles)
  const skip = (page - 1) * limit

  const [items, total] = await Promise.all([
    db.invite.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
        invitedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    db.invite.count(),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function revokeInvite(
  adminId: string,
  adminRoles: string[],
  inviteId: string,
  ip?: string,
) {
  assertAdmin(adminRoles)

  const invite = await db.invite.findUnique({ where: { id: inviteId }, select: { id: true, email: true, acceptedAt: true } })
  if (!invite) throw new InviteNotFoundError()
  if (invite.acceptedAt) throw new InviteAlreadyAcceptedError()

  await db.invite.delete({ where: { id: inviteId } })

  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_INVITE_REVOKED',
    entity: 'Invite',
    entityId: inviteId,
    payload: { email: invite.email },
    ipAddress: ip,
  })
}

export async function validateInviteToken(rawToken: string) {
  const tokenHash = hashToken(rawToken)
  const invite = await db.invite.findUnique({
    where: { tokenHash },
    select: { id: true, email: true, expiresAt: true, acceptedAt: true },
  })

  if (!invite) throw new InviteNotFoundError()
  if (invite.acceptedAt) throw new InviteAlreadyAcceptedError()
  if (invite.expiresAt < new Date()) throw new InviteExpiredError()

  return { email: invite.email, expiresAt: invite.expiresAt }
}

export type AcceptInviteInput = {
  firstName: string
  lastName: string
  phone: string
  password: string
  idNumber?: string
  consentToPopia: true
}

export async function acceptInvite(
  rawToken: string,
  input: AcceptInviteInput,
  ip?: string,
) {
  const tokenHash = hashToken(rawToken)
  const invite = await db.invite.findUnique({
    where: { tokenHash },
    select: { id: true, email: true, expiresAt: true, acceptedAt: true, invitedById: true },
  })

  if (!invite) throw new InviteNotFoundError()
  if (invite.acceptedAt) throw new InviteAlreadyAcceptedError()
  if (invite.expiresAt < new Date()) throw new InviteExpiredError()

  const phoneConflict = await db.user.findUnique({ where: { phone: input.phone }, select: { id: true } })
  if (phoneConflict) throw Object.assign(new Error('Phone number already registered'), { code: 'MBR_003', status: 409 })

  const [passwordHash, memberRole] = await Promise.all([
    bcrypt.hash(input.password, BCRYPT_ROUNDS),
    db.role.findUniqueOrThrow({ where: { name: 'MEMBER' } }),
  ])

  const encryptedId = input.idNumber ? encrypt(input.idNumber) : null

  const user = await db.$transaction(async (tx: typeof db) => {
    const created = await tx.user.create({
      data: {
        email: invite.email,
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName,
        password: passwordHash,
        idNumber: encryptedId,
        status: 'ACTIVE',
        emailVerified: new Date(),
        popiaConsentAt: new Date(),
      },
    })

    await tx.userRole.create({ data: { userId: created.id, roleId: memberRole.id } })
    await tx.notificationPreference.create({ data: { userId: created.id } })
    await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } })

    return created
  })

  await writeAuditLog({
    userId: user.id,
    action: 'INVITE_ACCEPTED',
    entity: 'Invite',
    entityId: invite.id,
    payload: { email: invite.email, invitedById: invite.invitedById },
    ipAddress: ip,
  })

  return { userId: user.id, email: user.email }
}

// ─── Role management ──────────────────────────────────────────────────────────

export async function setMemberRole(
  adminId: string,
  adminRoles: string[],
  memberId: string,
  roleName: 'ADMIN' | 'MEMBER',
  assign: boolean,
  ip?: string,
) {
  if (!adminRoles.includes('ADMIN')) throw new RoleForbiddenError()

  const [member, role] = await Promise.all([
    db.user.findUnique({ where: { id: memberId }, select: { id: true, email: true } }),
    db.role.findUniqueOrThrow({ where: { name: roleName } }),
  ])

  if (!member) {
    const e = new Error('Member not found') as Error & { code: string; status: number }
    e.code = 'ADM_001'; e.status = 404
    throw e
  }

  if (assign) {
    await db.userRole.upsert({
      where: { userId_roleId: { userId: memberId, roleId: role.id } },
      create: { userId: memberId, roleId: role.id },
      update: {},
    })
  } else {
    await db.userRole.deleteMany({ where: { userId: memberId, roleId: role.id } })
  }

  await writeAuditLog({
    userId: adminId,
    action: assign ? 'ADMIN_ROLE_ASSIGNED' : 'ADMIN_ROLE_REVOKED',
    entity: 'User',
    entityId: memberId,
    payload: { role: roleName, email: member.email },
    ipAddress: ip,
  })

  return { memberId, role: roleName, assigned: assign }
}
