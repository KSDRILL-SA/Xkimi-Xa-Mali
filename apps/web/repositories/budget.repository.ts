import { Prisma, BudgetType } from '@prisma/client'
import { db } from '@/lib/db'
import type { TxClient } from './contribution.repository'

// ─── Budget repository ──────────────────────────────────────────────────────
// Thin wrapper around db.userBudget.* / db.budgetOverride.* — zero business logic.

export const budgetRepo = {
  /** A member's active budget for a given type, if any. */
  findActiveByType(userId: string, type: BudgetType) {
    return db.userBudget.findFirst({ where: { userId, type, isActive: true } })
  },

  /** All budgets (active and deactivated) for a member, most recent first. */
  findAllByUser(userId: string) {
    return db.userBudget.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
  },

  /** Create a new budget. */
  create(data: Prisma.UserBudgetUncheckedCreateInput, tx: TxClient = db) {
    return tx.userBudget.create({ data })
  },

  /** Deactivate a budget (kept for history, not deleted). */
  deactivate(id: string, tx: TxClient = db) {
    return tx.userBudget.update({ where: { id }, data: { isActive: false } })
  },

  /** Record a budget override (does not block the payment). */
  createOverride(data: Prisma.BudgetOverrideUncheckedCreateInput, tx: TxClient = db) {
    return tx.budgetOverride.create({ data })
  },

  /** A member's override history, most recent first. */
  findOverridesByUser(userId: string) {
    return db.budgetOverride.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } })
  },
}
