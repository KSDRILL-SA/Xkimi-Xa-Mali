import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { TxClient } from './contribution.repository'

// ─── Admin signature repository ─────────────────────────────────────────────
// Thin wrapper around db.adminSignature.* / db.adminSignatureHistory.* — zero business logic.

export const signatureRepo = {
  /** The active signature for an admin, if any. */
  findByAdmin(adminId: string) {
    return db.adminSignature.findUnique({ where: { adminId } })
  },

  /** Create the initial signature record for an admin. */
  create(data: Prisma.AdminSignatureUncheckedCreateInput, tx: TxClient = db) {
    return tx.adminSignature.create({ data })
  },

  /** Replace an admin's signature in place (image, hash, lock window). */
  update(adminId: string, data: Prisma.AdminSignatureUpdateInput, tx: TxClient = db) {
    return tx.adminSignature.update({ where: { adminId }, data })
  },

  /** Archive a replaced signature into the immutable history table. */
  createHistory(data: Prisma.AdminSignatureHistoryUncheckedCreateInput, tx: TxClient = db) {
    return tx.adminSignatureHistory.create({ data })
  },

  /** An admin's signature change history, most recent first. */
  findHistory(adminId: string) {
    return db.adminSignatureHistory.findMany({ where: { adminId }, orderBy: { replacedAt: 'desc' } })
  },
}
