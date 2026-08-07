import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import { emailProvider } from '@/integrations/email'
import { smsProvider } from '@/integrations/sms'
import { writeAuditLog } from './audit.service'
import { logger } from '@xxm/observability'
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
  MemberCapReachedError,
} from '@/lib/errors'
import { MAX_MEMBERS } from '@xxm/utils'
import { assertAdmin, assertNotSelf, ROLES } from '@/lib/authorization'
import { bumpRoleVersion } from '@/lib/role-version'
import { userRepo, runTransaction } from '@/repositories/user.repository'
import { invitationRepo } from '@/repositories/invitation.repository'
import { authTokenRepo } from '@/repositories/auth-token.repository'

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


// ─── The fifty-member cap ─────────────────────────────────────────────────────

/**
 * How many of the fifty places are taken, and how many are left.
 *
 * A place is held by any member who has not been erased — `deletedAt` is the
 * only thing that frees one. Status does not: a suspended member keeps their
 * history and their place, and someone who has registered but not yet been
 * activated already occupies one.
 *
 * Pending invitations count too. Without that, leadership could issue
 * fifty-one links and the fifty-first person would be refused at the moment
 * they tried to accept — after being told they were welcome. Refusing at the
 * point of invitation puts the "no" in front of the person who can act on it.
 */
export async function countMemberPlaces() {
  const [members, pendingInvites] = await Promise.all([
    userRepo.count({ deletedAt: null }),
    invitationRepo.count({ status: 'PENDING', expiresAt: { gt: new Date() } }),
  ])

  const taken = members + pendingInvites
  return {
    members,
    pendingInvites,
    taken,
    cap: MAX_MEMBERS,
    remaining: Math.max(0, MAX_MEMBERS - taken),
    isFull: taken >= MAX_MEMBERS,
  }
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

  // Before anything else: is there a place to invite someone into? Checked
  // here rather than at registration so leadership learns the circle is full
  // while deciding to invite, not after the invitee has been told they are in.
  const places = await countMemberPlaces()
  if (places.isFull) throw new MemberCapReachedError(MAX_MEMBERS)

  const { firstName, lastName, email, phone, minimumAmount } = params
  const normPhone = smsProvider.normalisePhone(phone)

  const [existingInvite, existingUser] = await Promise.all([
    invitationRepo.findByEmailOrPhone(email, normPhone, {
      status: 'PENDING',
      select: { id: true },
    }),
    userRepo.findByEmailOrPhone(email, normPhone),
  ])
  if (existingInvite || existingUser) throw new InviteDuplicateError()

  const code            = generateInviteCode()
  const codeHash        = hashCode(code)
  const codePrefix      = code.split('-')[1]!
  const expiresAt       = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)
  const registrationUrl = `${baseUrl}/register?code=${encodeURIComponent(code)}`

  const invite = await invitationRepo.create({
    codeHash, codePrefix, firstName, lastName,
    email, phone: normPhone, minimumAmount, expiresAt,
    invitedById: adminId,
  })

  smsProvider.send({
    to: normPhone,
    body: [
      `Hi ${firstName}, you have been invited to join Xkimm Xa Mali Foundation.`,
      `Your invite code: ${code}`,
      `Tap to register: ${registrationUrl}`,
      `IMPORTANT: Never share this code with anyone. It expires in 7 days.`,
    ].join('\n'),
    userSuppliedId: `invite-${invite.id}`,
  }).catch((err) => logger.warn('Invite SMS delivery failed', { err, inviteId: invite.id }))

  emailProvider.sendInviteEmail(email, firstName, code, registrationUrl)
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
    invitationRepo.findMany({}, {
      skip, take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, codePrefix: true, firstName: true, lastName: true,
        email: true, phone: true, minimumAmount: true,
        status: true, expiresAt: true, acceptedAt: true, createdAt: true,
        invitedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    invitationRepo.count(),
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

  const invite = await invitationRepo.findById(inviteId, {
    id: true, email: true, status: true,
  })
  if (!invite) throw new InviteNotFoundError()
  if (invite.status === 'ACCEPTED') throw new InviteUsedError()
  if (invite.status === 'REVOKED') throw new InviteRevokedError()

  await invitationRepo.update(inviteId, {
    status: 'REVOKED', revokedById: adminId, revokedAt: new Date(),
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
  const invite = await invitationRepo.findByCodeHash(codeHash, {
    id: true, status: true, expiresAt: true,
    firstName: true, lastName: true, email: true, phone: true, minimumAmount: true,
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
  const invite = await invitationRepo.findByCodeHash(codeHash, {
    id: true, status: true, expiresAt: true, email: true, phone: true, invitedById: true,
  })

  if (!invite) throw new InviteNotFoundError()
  if (invite.status === 'ACCEPTED') throw new InviteUsedError()
  if (invite.status === 'REVOKED') throw new InviteRevokedError()
  if (invite.expiresAt < new Date()) throw new InviteExpiredError()

  if (input.email.toLowerCase().trim() !== invite.email.toLowerCase())
    throw new InviteBindingError()
  if (smsProvider.normalisePhone(input.phone) !== invite.phone)
    throw new InviteBindingError()

  const [passwordHash, memberRole] = await Promise.all([
    bcrypt.hash(input.password, BCRYPT_ROUNDS),
    userRepo.findRoleOrThrow('MEMBER'),
  ])

  const encryptedId = input.idNumber ? encrypt(input.idNumber) : null
  const rawToken    = generateToken()
  const tokenHash   = hashToken(rawToken)

  const user = await runTransaction(async (tx) => {
    // Backstop. The real gate is at invitation issue; this catches two invitees
    // accepting at once, where both were inside the cap when they were invited.
    //
    // Counts *members* only, not invitations. This person is holding a pending
    // invitation right now — counting it would refuse the fiftieth member on
    // the strength of their own invite. Accepting converts a held place into an
    // occupied one, so the question is only whether the fifty seats are already
    // filled by people.
    const members = await tx.user.count({ where: { deletedAt: null } })
    if (members >= MAX_MEMBERS) throw new MemberCapReachedError(MAX_MEMBERS)

    const created = await userRepo.create({
      email:          invite.email,
      phone:          invite.phone,
      firstName:      input.firstName.trim(),
      lastName:       input.lastName.trim(),
      password:       passwordHash,
      idNumber:       encryptedId,
      status:         'PENDING',
      popiaConsentAt: new Date(),
    }, tx)

    await userRepo.createUserRole({ userId: created.id, roleId: memberRole.id }, tx)
    await tx.notificationPreference.create({ data: { userId: created.id } })
    await authTokenRepo.createVerificationTokenInTx(
      { userId: created.id, tokenHash, expiresAt: new Date(Date.now() + VERIF_TTL_MS) },
      tx,
    )
    await invitationRepo.update(invite.id, {
      status: 'ACCEPTED', acceptedById: created.id, acceptedAt: new Date(),
    }, tx)

    return created
  })

  await emailProvider.sendVerificationEmail(user.email, user.firstName, rawToken, baseUrl)

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

    const adminRole = await userRepo.findRole(ROLES.ADMIN)
    if (adminRole) {
      const adminCount = await userRepo.countUserRoles({ roleId: adminRole.id })
      if (adminCount <= 1) {
        throw new ForbiddenError('Cannot remove the last admin — at least one admin must remain')
      }
    }
  }

  if (!assign && roleName === ROLES.MEMBER) {
    assertNotSelf(adminId, memberId, 'revoke your own member role')
  }

  const [member, role] = await Promise.all([
    userRepo.findById(memberId),
    userRepo.findRoleOrThrow(roleName),
  ])

  if (!member) throw new AdminNotFoundError('Member not found')

  if (assign) {
    await userRepo.upsertUserRole(
      { userId_roleId: { userId: memberId, roleId: role.id } },
      { userId: memberId, roleId: role.id },
      {},
    )
  } else {
    await userRepo.deleteUserRoles({ userId: memberId, roleId: role.id })
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
