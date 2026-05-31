import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import { env } from '@/lib/env'
import { encrypt } from '@/lib/encryption'
import { sendVerificationEmail, sendPasswordResetEmail } from '@/lib/email'
import { writeAuditLog } from './audit.service'
import { logger } from '@/lib/logger'
import { userRepo, runTransaction } from '@/repositories/user.repository'
import { authTokenRepo } from '@/repositories/auth-token.repository'
import {
  UserAlreadyExistsError,
  InvalidTokenError,
  InvalidCredentialsError,
} from '@/lib/errors'
import type { RegisterInput } from '@/lib/validation/auth'

const BCRYPT_ROUNDS = 12
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000
const RESET_TTL_MS = 60 * 60 * 1000

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
  const existing = await userRepo.findByEmailOrPhone(input.email, input.phone)

  if (existing) {
    const field = existing.email === input.email ? 'email' : 'phone'
    throw new UserAlreadyExistsError(field as 'email' | 'phone')
  }

  const [passwordHash, memberRole] = await Promise.all([
    bcrypt.hash(input.password, BCRYPT_ROUNDS),
    userRepo.findRoleOrThrow('MEMBER'),
  ])

  const adminRole = await userRepo.findRole('ADMIN')
  const founderEmail = env.FOUNDER_EMAIL
  const isFounder = founderEmail && input.email.toLowerCase() === founderEmail.toLowerCase()

  const roleConnections = [{ roleId: memberRole.id }]
  if (isFounder && adminRole) roleConnections.push({ roleId: adminRole.id })

  const user = await userRepo.create({
    email: input.email,
    phone: input.phone,
    firstName: input.firstName,
    lastName: input.lastName,
    idNumber: input.idNumber ? encrypt(input.idNumber) : null,
    password: passwordHash,
    popiaConsentAt: input.consentToPopia ? new Date() : null,
    status: 'PENDING',
    roles: { create: roleConnections },
  })

  // Issue email verification token
  const rawToken = generateToken()
  const tokenHash = hashToken(rawToken)

  await authTokenRepo.createVerificationToken({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
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

  const record = await authTokenRepo.findVerificationToken(tokenHash)

  if (!record || record.expiresAt < new Date()) throw new InvalidTokenError('Invalid or expired verification link')
  if (record.usedAt) throw new InvalidTokenError('This verification link has already been used')

  await runTransaction(async (tx) => {
    await authTokenRepo.updateVerificationToken(tokenHash, { usedAt: new Date() }, tx)
    await tx.user.update({
      where: { id: record.userId },
      data: { status: 'ACTIVE', emailVerified: new Date() },
    })
  })

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
  const user = await userRepo.findByEmail(email)
  if (!user) return

  // Invalidate any existing unused tokens
  await authTokenRepo.invalidateResetTokens(user.id)

  const rawToken = generateToken()
  const tokenHash = hashToken(rawToken)

  await authTokenRepo.createResetToken({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
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

  const record = await authTokenRepo.findResetToken(tokenHash)

  if (!record || record.expiresAt < new Date()) throw new InvalidTokenError('Invalid or expired reset link')
  if (record.usedAt) throw new InvalidTokenError('This reset link has already been used')

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

  await runTransaction(async (tx) => {
    await tx.passwordResetToken.update({
      where: { tokenHash },
      data: { usedAt: new Date() },
    })
    await tx.user.update({
      where: { id: record.userId },
      data: { password: passwordHash },
    })
  })

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
  const user = await userRepo.findByIdOrThrow(userId)

  if (!user.password) throw new InvalidCredentialsError('No password set on this account')

  const valid = await bcrypt.compare(currentPassword, user.password)
  if (!valid) {
    logger.warn('Failed password change attempt', { userId })
    throw new InvalidCredentialsError('Current password is incorrect')
  }

  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS)

  await userRepo.update(userId, { password: passwordHash })

  await writeAuditLog({
    userId,
    action: 'PASSWORD_CHANGED',
    entity: 'User',
    entityId: userId,
    ipAddress,
  })
}
