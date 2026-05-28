import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { sendInviteEmail, sendVerificationEmail } from '@/lib/email'
import { sendSMS, normalisePhone } from '@/lib/bulksms'
import { writeAuditLog } from './audit.service'
import { encrypt } from '@/lib/encryption'

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
  const buf = randomBytes(5) // 40 bits → 8 Crockford chars
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

function assertAdmin(roles: string[]) {
  if (!roles.includes('ADMIN')) throw new InviteForbiddenError()
}

// ─── Domain errors ────────────────────────────────────────────────────────────

export class InviteForbiddenError extends Error {
  code = 'SYS_003'; status = 403
  constructor() { super('Admin access required') }
}
export class InviteNotFoundError extends Error {
  code = 'INV_001'; status = 400
  constructor() { super('Invalid invite code') }
}
export class InviteUsedError extends Error {
  code = 'INV_002'; status = 400
  constructor() { super('This invite code has already been used') }
}
export class InviteRevokedError extends Error {
  code = 'INV_003'; status = 400
  constructor() { super('This invite code has been revoked') }
}
export class InviteExpiredError extends Error {
  code = 'INV_004'; status = 400
  constructor() { super('This invite code has expired') }
}
export class InviteBindingError extends Error {
  code = 'INV_005'; status = 403
  constructor() { super('Email or phone does not match the invite') }
}
export class InviteDuplicateError extends Error {
  code = 'INV_006'; status = 409
  constructor() { super('An active invite or account already exists for this email or phone') }
}
export class RoleForbiddenError extends Error {
  code = 'SYS_003'; status = 403
  constructor() { super('Admin access required') }
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

  // Guard: no active invite or existing account for this email/phone
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
  const codePrefix      = code.split('-')[1] // 4-char first segment
  const expiresAt       = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
  const registrationUrl = `${baseUrl}/auth/register?code=${encodeURIComponent(code)}`

  const invite = await db.invitation.create({
    data: {
      codeHash, codePrefix, firstName, lastName,
      email, phone: normPhone, minimumAmount, expiresAt,
      invitedById: adminId,
    },
  })

  // Auto-deliver code + registration link to invitee's phone via SMS
  sendSMS({
    to: normPhone,
    body: [
      `Hi ${firstName}, you have been invited to join Xkimm Xa Mali.`,
      ``,
      `Your invite code: ${code}`,
      ``,
      `Tap the link below to register — your code will be pre-filled:`,
      registrationUrl,
      ``,
      `IMPORTANT: This code is personal to you. Never share it with`,
      `anyone — including Xkimm Xa Mali staff or admins. We will`,
      `NEVER ask you for this code. It expires in 7 days.`,
    ].join('\n'),
    userSuppliedId: `invite-${invite.id}`,
  }).catch((_err) => {
    // Delivery failure is non-fatal — admin still has the code to share
  })

  // Send email with code + clickable registration link
  sendInviteEmail(email, firstName, code, registrationUrl).catch((_err) => {
    // Non-fatal
  })

  await writeAuditLog({
    userId: adminId,
    action: 'ADMIN_INVITE_CREATED',
    entity: 'Invitation',
    entityId: invite.id,
    payload: { email, phone: normPhone, expiresAt },
    ipAddress: ip,
  })

  return { id: invite.id, code, codePrefix, email, phone: normPhone, firstName, lastName, expiresAt }
}

// ─── List invitations ─────────────────────────────────────────────────────────

export async function listInvitations(adminRoles: string[], page = 1, limit = 20) {
  assertAdmin(adminRoles)
  const skip = (page - 1) * limit

  const [items, total] = await Promise.all([
    db.invitation.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        codePrefix: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        minimumAmount: true,
        status: true,
        expiresAt: true,
        acceptedAt: true,
        createdAt: true,
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
    data: { status: 'REVOKED' },
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
      id: true,
      status: true,
      expiresAt: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      minimumAmount: true,
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
    select: {
      id: true,
      status: true,
      expiresAt: true,
      email: true,
      phone: true,
      invitedById: true,
    },
  })

  if (!invite) throw new InviteNotFoundError()
  if (invite.status === 'ACCEPTED') throw new InviteUsedError()
  if (invite.status === 'REVOKED') throw new InviteRevokedError()
  if (invite.expiresAt < new Date()) throw new InviteExpiredError()

  // Binding enforcement — submitted email+phone must match the invite exactly
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

  const user = await db.$transaction(async (tx: typeof db) => {
    const created = await tx.user.create({
      data: {
        email:         invite.email,
        phone:         invite.phone,
        firstName:     input.firstName.trim(),
        lastName:      input.lastName.trim(),
        password:      passwordHash,
        idNumber:      encryptedId,
        status:        'PENDING',
        popiaConsentAt: new Date(),
      },
    })

    await tx.userRole.create({ data: { userId: created.id, roleId: memberRole.id } })
    await tx.notificationPreference.create({ data: { userId: created.id } })
    await tx.emailVerificationToken.create({
      data: {
        userId:    created.id,
        tokenHash,
        expiresAt: new Date(Date.now() + VERIF_TTL_MS),
      },
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
