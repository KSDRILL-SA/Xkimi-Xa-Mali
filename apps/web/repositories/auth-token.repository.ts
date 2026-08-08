import { db } from '@/lib/db'
import type { PrismaClient, Prisma } from '@prisma/client'

type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export const authTokenRepo = {
  // ─── Email verification tokens ─────────────────────────────────────────────

  findVerificationToken(tokenHash: string) {
    return db.emailVerificationToken.findUnique({ where: { tokenHash } })
  },

  createVerificationToken(data: Prisma.EmailVerificationTokenUncheckedCreateInput) {
    return db.emailVerificationToken.create({ data })
  },

  updateVerificationToken(tokenHash: string, data: Prisma.EmailVerificationTokenUpdateInput, tx?: TxClient) {
    const client = tx ?? db
    return client.emailVerificationToken.update({ where: { tokenHash }, data })
  },

  createVerificationTokenInTx(data: Prisma.EmailVerificationTokenUncheckedCreateInput, tx: TxClient) {
    return tx.emailVerificationToken.create({ data })
  },

  // Atomically consume a still-valid verification token. The single conditional
  // updateMany flips usedAt from null to now() only if the token is unused and
  // unexpired, and reports whether THIS call was the one that consumed it — so
  // concurrent requests with the same token cannot both succeed (closes the
  // check-then-act TOCTOU window).
  async consumeVerificationToken(tokenHash: string, tx: TxClient): Promise<boolean> {
    const { count } = await tx.emailVerificationToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    })
    return count === 1
  },

  // Retire every outstanding verification link for this account.
  //
  // Called before issuing a replacement, so asking for a new link cannot leave
  // two working ones behind — the same rule `invalidateResetTokens` applies to
  // password resets, and for the same reason: a link that reaches a mailbox
  // stays valid until something says otherwise.
  invalidateVerificationTokens(userId: string) {
    return db.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    })
  },

  // ─── Password reset tokens ────────────────────────────────────────────────

  findResetToken(tokenHash: string) {
    return db.passwordResetToken.findUnique({ where: { tokenHash } })
  },

  createResetToken(data: Prisma.PasswordResetTokenUncheckedCreateInput) {
    return db.passwordResetToken.create({ data })
  },

  updateResetToken(tokenHash: string, data: Prisma.PasswordResetTokenUpdateInput) {
    return db.passwordResetToken.update({ where: { tokenHash }, data })
  },

  // Atomically consume a still-valid reset token (see consumeVerificationToken).
  // Returns true only for the single caller that won the race, so a leaked or
  // replayed reset link cannot set the password twice.
  async consumeResetToken(tokenHash: string, tx: TxClient): Promise<boolean> {
    const { count } = await tx.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    })
    return count === 1
  },

  invalidateResetTokens(userId: string) {
    return db.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    })
  },
}
