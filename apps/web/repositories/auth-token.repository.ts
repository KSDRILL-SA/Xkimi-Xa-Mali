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

  invalidateResetTokens(userId: string) {
    return db.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    })
  },
}
