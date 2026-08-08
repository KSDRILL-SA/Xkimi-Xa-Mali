import bcrypt from 'bcryptjs'
import { createHash, randomBytes } from 'crypto'
import { emailProvider } from '@/integrations/email'
import { writeAuditLog } from './audit.service'
import { logger } from '@xxm/observability'
import { userRepo, runTransaction } from '@/repositories/user.repository'
import { authTokenRepo } from '@/repositories/auth-token.repository'
import {
  InvalidTokenError,
  InvalidCredentialsError,
} from '@/lib/errors'
import { bumpRoleVersion } from '@/lib/role-version'

const BCRYPT_ROUNDS = 12
const RESET_TTL_MS = 60 * 60 * 1000

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export async function verifyEmail(rawToken: string, ipAddress?: string) {
  const tokenHash = hashToken(rawToken)

  const record = await authTokenRepo.findVerificationToken(tokenHash)

  if (!record || record.expiresAt < new Date()) throw new InvalidTokenError('Invalid or expired verification link')
  if (record.usedAt) throw new InvalidTokenError('This verification link has already been used')

  await runTransaction(async (tx) => {
    const consumed = await authTokenRepo.consumeVerificationToken(tokenHash, tx)
    if (!consumed) throw new InvalidTokenError('This verification link has already been used')

    // Verifying an address proves the address. It does not decide status.
    //
    // This wrote `status: 'ACTIVE'` unconditionally, so a member suspended
    // between registering and clicking the link came back ACTIVE by clicking
    // it — the suspension undone by the suspended person, with nothing but an
    // EMAIL_VERIFIED audit entry to show for it. Activation is only ever the
    // promotion of a PENDING account.
    //
    // `updateMany` with the status in the predicate rather than a read followed
    // by a write: the status is decided in the same statement that changes it,
    // so a suspension landing mid-transaction cannot be missed.
    await tx.user.updateMany({
      where: { id: record.userId, status: 'PENDING' },
      data: { status: 'ACTIVE', emailVerified: new Date() },
    })

    // The address is verified either way. A suspended member who confirms their
    // email has still confirmed it, and should not be asked again if they are
    // later reinstated.
    await tx.user.updateMany({
      where: { id: record.userId, emailVerified: null },
      data: { emailVerified: new Date() },
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

  await emailProvider.sendPasswordResetEmail(user.email, user.firstName, rawToken, baseUrl)

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
    const consumed = await authTokenRepo.consumeResetToken(tokenHash, tx)
    if (!consumed) throw new InvalidTokenError('This reset link has already been used')
    await tx.user.update({
      where: { id: record.userId },
      data: {
        password: passwordHash,
        // Validated by PasswordResetSchema against the current policy, so this
        // password satisfies it and the account is no longer asked to reset.
        passwordChangedAt: new Date(),
        // Resetting the password clears the lockout, which it did not before.
        //
        // "Too many failed attempts — try again later or reset your password"
        // was the advice, and resetting did not lift the lock, so the member
        // did the thing they were told to do and still could not get in. It is
        // also the only self-service way out: with a single admin, an attacker
        // who locks that account and keeps it locked otherwise removes the
        // console from the person who would fix it.
        //
        // Safe because reaching here required a token sent to the address on
        // the account. Whoever cleared it proved control of the mailbox, which
        // is a stronger claim than the failed guesses that set it.
        loginAttempts: 0,
        lockedUntil: null,
      },
    })
  })

  await Promise.all([
    bumpRoleVersion(record.userId),
    writeAuditLog({
      userId: record.userId,
      action: 'PASSWORD_RESET',
      entity: 'User',
      entityId: record.userId,
      ipAddress,
    }),
  ])
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

  await Promise.all([
    userRepo.update(userId, { password: passwordHash, passwordChangedAt: new Date() }),
    bumpRoleVersion(userId),
  ])

  await writeAuditLog({
    userId,
    action: 'PASSWORD_CHANGED',
    entity: 'User',
    entityId: userId,
    ipAddress,
  })
}
