import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import { db, Prisma } from '@/lib/db'
import { sendInviteEmail, sendVerificationEmail } from '@/lib/email'
import { sendSMS, normalisePhone } from '@/lib/bulksms'
import { writeAuditLog } from './audit.service'
import { logger } from '@/lib/logger'
import { encrypt } from '@/lib/encryption'
import {
  ForbiddenError,
  AdminNotFoundError,
  InviteNotFoundError,
  InviteUsedError,
  InviteRevokedError,
  InviteExpiredError,
  InviteBindingError,
  InviteDuplicateError,
} from '@/lib/errors'
import { assertAdmin, assertNotSelf, ROLES } from '@/lib/authorization'
import { bumpRoleVersion } from '@/lib/role-version'

// Re-export domain errors for callers that import them from this module
export {
  InviteNotFoundError,
  InviteUsedError,
  InviteRevokedError,
  InviteExpiredError,
  InviteBindingError,
  InviteDuplicateError,
}

const INVITE_TTL_DAYS = 7
const BCRYPT_ROUNDS   = 12
const VERIF_TTL_MS    = 24 * 60 * 60 * 1000

// ─── Crockford Base32 ─────────────────────────────────────────────────────────

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function crockfordEncode(buf: Buffer): string {
  let result = ''
  let bits = 0
  let value = 0
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      result += CROCKFORD[(value >> bits) & 0x1f]
    }
  }
  if (bits > 0) result += CROCKFORD[(value << (5 - bits)) & 0x1f]
  return result
}

function generateInviteCode(): string {
  const buf = randomBytes(5)
  const enc = crockfordEncode(buf)
  return `XKM-${enc.slice(0, 4)}-${enc.slice(4, 8)}`
}

function hashCode(code: string): string {
  return createHash('sha256').update(code.toUpperCase()).digest('hex')
}

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}


// ─── Create invite ────────────────────────────────────────────────────────────

export type CreateInviteParams = {
  firstName: string
  lastName: string
  email: string
  phone: string
  minimumAmount: number
}

export async function generateInvite(
  adminId: string,
  adminRoles: string[],
  params: CreateInviteParams,
  baseUrl: string,
  ip?: string,
) {
  assertAdmin(adminRoles)

  const { firstName, lastName, email, phone, minimumAmount } = params
  const normPhone = normalisePhone(phone)

  const [existingInvite, existingUser] = await Promise.all([
    db.invitation.findFirst({
      where: { OR: [{ email }, { phone: normPhone }], status: 'PENDING' },
      select: { id: true },
    }),
    db.user.findFirst({
      where: { OR: [{ email }, { phone: normPhone }] },
      select: { id: true },
    }),
  ])
  if (existingInvite || existingUser) throw new InviteDuplicateError()

  const code            = generateInviteCode()
  const codeHash        = hashCode(code)
  const codePrefix      = code.split('-')[1]
  const expiresAt       = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
  const registrationUrl = `${baseUrl}/auth/register?code=${encodeURIComponent(code)}`

  const invite = await db.invitation.create({
    data: {
      codeHash, codePrefix, firstName, lastName,
      email, phone: normPhone, minimumAmount, expiresAt,
      invitedById: adminId,
    },
  })

  sendSMS({
    to: normPhone,
    body: [
      `Hi ${firstName}, you have been invited to join Xkimm Xa Mali.`,
      `Your invite code: ${code}`,
      `Tap to register: ${registrationUrl}`,
      `IMPORTANT: Never share this code with anyone. It expires in 7 days.`,
    ].join('\n'),
    userSuppliedId: `invite-${invite.id}`,
  }).catch((err) => logger.warn('Invite SMS delivery failed', { err, inviteId: invite.id }))

  sendInviteEmail(email, firstName, code, registrationUrl)
    .catch((err) => logger.warn('Invite email delivery failed', { err, inviteId: invite.id }))

  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_INVITE_CREATED',
    entity: 'Invitation',
    entityId: invite.id,
    payload: { email, phone: normPhone, expiresAt },
    ipAddress: ip,
  })

  logger.info('Invite created', { inviteId: invite.id, email, adminId })

  return { id: invite.id, code, codePrefix, email, phone: normPhone, firstName, lastName, expiresAt }
}

// ─── List invitations ─────────────────────────────────────────────────────────

export async function listInvitations(adminRoles: string[], page = 1, limit = 20) {
  assertAdmin(adminRoles)
  const skip = (page - 1) * limit

  const [items, total] = await Promise.all([
    db.invitation.findMany({
      skip, take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, codePrefix: true, firstName: true, lastName: true,
        email: true, phone: true, minimumAmount: true,
        status: true, expiresAt: true, acceptedAt: true, createdAt: true,
        invitedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    db.invitation.count(),
  ])

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

// ─── Revoke invitation ────────────────────────────────────────────────────────

export async function revokeInvitation(
  adminId: string,
  adminRoles: string[],
  inviteId: string,
  ip?: string,
) {
  assertAdmin(adminRoles)

  const invite = await db.invitation.findUnique({
    where: { id: inviteId },
    select: { id: true, email: true, status: true },
  })
  if (!invite) throw new InviteNotFoundError()
  if (invite.status === 'ACCEPTED') throw new InviteUsedError()
  if (invite.status === 'REVOKED') throw new InviteRevokedError()

  await db.invitation.update({
    where: { id: inviteId },
    data: { status: 'REVOKED', revokedById: adminId, revokedAt: new Date() },
  })

  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_INVITE_REVOKED',
    entity: 'Invitation',
    entityId: inviteId,
    payload: { email: invite.email },
    ipAddress: ip,
  })
}

// ─── Validate invite code (public — Step 1 of 2) ─────────────────────────────

export async function validateInviteCode(code: string) {
  const codeHash = hashCode(code)
  const invite = await db.invitation.findUnique({
    where: { codeHash },
    select: {
      id: true, status: true, expiresAt: true,
      firstName: true, lastName: true, email: true, phone: true, minimumAmount: true,
    },
  })

  if (!invite) throw new InviteNotFoundError()
  if (invite.status === 'ACCEPTED') throw new InviteUsedError()
  if (invite.status === 'REVOKED') throw new InviteRevokedError()
  if (invite.expiresAt < new Date()) throw new InviteExpiredError()

  return {
    firstName:     invite.firstName,
    lastName:      invite.lastName,
    email:         invite.email,
    phone:         invite.phone,
    minimumAmount: Number(invite.minimumAmount),
  }
}

// ─── Accept invite registration (Step 2 of 2) ────────────────────────────────

export type RegisterWithInviteInput = {
  inviteCode:     string
  firstName:      string
  lastName:       string
  phone:          string
  email:          string
  idNumber?:      string
  password:       string
  consentToPopia: true
}

export async function acceptInviteRegistration(
  input: RegisterWithInviteInput,
  baseUrl: string,
  ip?: string,
) {
  const codeHash = hashCode(input.inviteCode)
  const invite = await db.invitation.findUnique({
    where: { codeHash },
    select: { id: true, status: true, expiresAt: true, email: true, phone: true, invitedById: true },
  })

  if (!invite) throw new InviteNotFoundError()
  if (invite.status === 'ACCEPTED') throw new InviteUsedError()
  if (invite.status === 'REVOKED') throw new InviteRevokedError()
  if (invite.expiresAt < new Date()) throw new InviteExpiredError()

  if (input.email.toLowerCase().trim() !== invite.email.toLowerCase())
    throw new InviteBindingError()
  if (normalisePhone(input.phone) !== invite.phone)
    throw new InviteBindingError()

  const [passwordHash, memberRole] = await Promise.all([
    bcrypt.hash(input.password, BCRYPT_ROUNDS),
    db.role.findUniqueOrThrow({ where: { name: 'MEMBER' } }),
  ])

  const encryptedId = input.idNumber ? encrypt(input.idNumber) : null
  const rawToken    = generateToken()
  const tokenHash   = hashToken(rawToken)

  const user = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.user.create({
      data: {
        email:          invite.email,
        phone:          invite.phone,
        firstName:      input.firstName.trim(),
        lastName:       input.lastName.trim(),
        password:       passwordHash,
        idNumber:       encryptedId,
        status:         'PENDING',
        popiaConsentAt: new Date(),
      },
    })

    await tx.userRole.create({ data: { userId: created.id, roleId: memberRole.id } })
    await tx.notificationPreference.create({ data: { userId: created.id } })
    await tx.emailVerificationToken.create({
      data: { userId: created.id, tokenHash, expiresAt: new Date(Date.now() + VERIF_TTL_MS) },
    })
    await tx.invitation.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED', acceptedById: created.id, acceptedAt: new Date() },
    })

    return created
  })

  await sendVerificationEmail(user.email, user.firstName, rawToken, baseUrl)

  await writeAuditLog({
    userId: user.id,
    action: 'INVITE_ACCEPTED',
    entity: 'Invitation',
    entityId: invite.id,
    payload: { email: invite.email, invitedById: invite.invitedById },
    ipAddress: ip,
  })

  logger.info('Registration via invite completed', { userId: user.id, inviteId: invite.id })

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
  assertAdmin(adminRoles)

  if (!assign && roleName === ROLES.ADMIN) {
    assertNotSelf(adminId, memberId, 'revoke your own admin role')

    const adminRole = await db.role.findUnique({ where: { name: ROLES.ADMIN } })
    if (adminRole) {
      const adminCount = await db.userRole.count({ where: { roleId: adminRole.id } })
      if (adminCount <= 1) {
        throw new ForbiddenError('Cannot remove the last admin — at least one admin must remain')
      }
    }
  }

  if (!assign && roleName === ROLES.MEMBER) {
    assertNotSelf(adminId, memberId, 'revoke your own member role')
  }

  const [member, role] = await Promise.all([
    db.user.findUnique({ where: { id: memberId }, select: { id: true, email: true } }),
    db.role.findUniqueOrThrow({ where: { name: roleName } }),
  ])

  if (!member) throw new AdminNotFoundError('Member not found')

  if (assign) {
    await db.userRole.upsert({
      where: { userId_roleId: { userId: memberId, roleId: role.id } },
      create: { userId: memberId, roleId: role.id },
      update: {},
    })
  } else {
    await db.userRole.deleteMany({ where: { userId: memberId, roleId: role.id } })
  }

  await bumpRoleVersion(memberId)

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
