import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { encrypt } from '@/lib/encryption'
import { sendVerificationEmail, sendPasswordResetEmail } from '@/lib/email'
import { writeAuditLog } from './audit.service'
import type { RegisterInput } from '@/lib/validation/auth'

const BCRYPT_ROUNDS = 12
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const RESET_TTL_MS = 60 * 60 * 1000             // 1h

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export async function registerUser(
  input: RegisterInput,
  baseUrl: string,
  ipAddress?: string,
) {
  const existing = await db.user.findFirst({
    where: { OR: [{ email: input.email }, { phone: input.phone }] },
  })

  if (existing) {
    const field = existing.email === input.email ? 'email' : 'phone'
    throw Object.assign(new Error('User already exists'), { code: 'MBR_002', field })
  }

  const [passwordHash, memberRole] = await Promise.all([
    bcrypt.hash(input.password, BCRYPT_ROUNDS),
    db.role.findUniqueOrThrow({ where: { name: 'MEMBER' } }),
  ])

  const adminRole = await db.role.findUnique({ where: { name: 'ADMIN' } })
  const founderEmail = process.env.FOUNDER_EMAIL
  const isFounder = founderEmail && input.email.toLowerCase() === founderEmail.toLowerCase()

  const roleConnections = [{ roleId: memberRole.id }]
  if (isFounder && adminRole) roleConnections.push({ roleId: adminRole.id })

  const user = await db.user.create({
    data: {
      email: input.email,
      phone: input.phone,
      firstName: input.firstName,
      lastName: input.lastName,
      idNumber: input.idNumber ? encrypt(input.idNumber) : null,
      password: passwordHash,
      popiaConsentAt: input.consentToPopia ? new Date() : null,
      status: 'PENDING',
      roles: { create: roleConnections },
    },
  })

  // Issue email verification token
  const rawToken = generateToken()
  const tokenHash = hashToken(rawToken)

  await db.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    },
  })

  await sendVerificationEmail(user.email, user.firstName, rawToken, baseUrl)

  await writeAuditLog({
    userId: user.id,
    action: 'REGISTER',
    entity: 'User',
    entityId: user.id,
    payload: { email: user.email, isFounder: Boolean(isFounder) },
    ipAddress,
  })

  return { id: user.id, email: user.email }
}

export async function verifyEmail(rawToken: string, ipAddress?: string) {
  const tokenHash = hashToken(rawToken)

  const record = await db.emailVerificationToken.findUnique({ where: { tokenHash } })

  if (!record) throw Object.assign(new Error('Invalid token'), { code: 'AUTH_004' })
  if (record.usedAt) throw Object.assign(new Error('Token already used'), { code: 'AUTH_004' })
  if (record.expiresAt < new Date()) throw Object.assign(new Error('Token expired'), { code: 'AUTH_004' })

  await db.$transaction([
    db.emailVerificationToken.update({
      where: { tokenHash },
      data: { usedAt: new Date() },
    }),
    db.user.update({
      where: { id: record.userId },
      data: { status: 'ACTIVE', emailVerified: new Date() },
    }),
  ])

  await writeAuditLog({
    userId: record.userId,
    action: 'EMAIL_VERIFIED',
    entity: 'User',
    entityId: record.userId,
    ipAddress,
  })
}

export async function requestPasswordReset(email: string, baseUrl: string, ipAddress?: string) {
  // Always return without revealing whether email exists
  const user = await db.user.findUnique({ where: { email } })
  if (!user) return

  // Invalidate any existing unused tokens
  await db.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  })

  const rawToken = generateToken()
  const tokenHash = hashToken(rawToken)

  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  })

  await sendPasswordResetEmail(user.email, user.firstName, rawToken, baseUrl)

  await writeAuditLog({
    userId: user.id,
    action: 'PASSWORD_RESET_REQUESTED',
    entity: 'User',
    entityId: user.id,
    ipAddress,
  })
}

export async function resetPassword(rawToken: string, newPassword: string, ipAddress?: string) {
  const tokenHash = hashToken(rawToken)

  const record = await db.passwordResetToken.findUnique({ where: { tokenHash } })

  if (!record) throw Object.assign(new Error('Invalid token'), { code: 'AUTH_004' })
  if (record.usedAt) throw Object.assign(new Error('Token already used'), { code: 'AUTH_004' })
  if (record.expiresAt < new Date()) throw Object.assign(new Error('Token expired'), { code: 'AUTH_004' })

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

  await db.$transaction([
    db.passwordResetToken.update({
      where: { tokenHash },
      data: { usedAt: new Date() },
    }),
    db.user.update({
      where: { id: record.userId },
      data: { password: passwordHash },
    }),
  ])

  await writeAuditLog({
    userId: record.userId,
    action: 'PASSWORD_RESET',
    entity: 'User',
    entityId: record.userId,
    ipAddress,
  })
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  ipAddress?: string,
) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } })

  if (!user.password) throw Object.assign(new Error('No password set'), { code: 'AUTH_001' })

  const valid = await bcrypt.compare(currentPassword, user.password)
  if (!valid) throw Object.assign(new Error('Current password incorrect'), { code: 'AUTH_001' })

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

  await db.user.update({ where: { id: userId }, data: { password: passwordHash } })

  await writeAuditLog({
    userId,
    action: 'PASSWORD_CHANGED',
    entity: 'User',
    entityId: userId,
    ipAddress,
  })
}
