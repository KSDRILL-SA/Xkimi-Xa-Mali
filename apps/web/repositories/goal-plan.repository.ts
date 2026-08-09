import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ─── Goal plan repository ──────────────────────────────────────────────────
// Thin wrapper around db.goalPlan.* — zero business logic.

export const goalPlanRepo = {
  findById(id: string) {
    return db.goalPlan.findUnique({ where: { id } })
  },

  /** The member's live plan for a goal, if they have one. */
  findActive(userId: string, goalId: string) {
    return db.goalPlan.findFirst({ where: { userId, goalId, status: 'ACTIVE' } })
  },

  findManyByUser(userId: string, status?: Prisma.EnumGoalPlanStatusFilter) {
    return db.goalPlan.findMany({
      where: { userId, ...(status && { status }) },
      orderBy: { createdAt: 'desc' },
      include: { goal: { select: { id: true, title: true, targetAmount: true, currentAmount: true, deadline: true, status: true } } },
    })
  },

  /**
   * Every plan that could collect on a given day of the month.
   *
   * Deliberately wider than "due today": a plan whose debit day is past the end
   * of a short month still collects on that month's last day, so the job asks
   * for the chosen day *and* anything later, then decides per plan.
   */
  findDueCandidates(dayOfMonth: number) {
    return db.goalPlan.findMany({
      where: { status: 'ACTIVE', debitDay: { gte: dayOfMonth } },
      include: { goal: { select: { id: true, title: true, targetAmount: true, currentAmount: true, deadline: true, status: true } } },
    })
  },

  create(data: Prisma.GoalPlanUncheckedCreateInput) {
    return db.goalPlan.create({ data })
  },

  /**
   * Update a plan only if it is still on the version that was read.
   *
   * The collection job and the member's own cancel can land at the same moment;
   * without this the job could reactivate a plan the member had just stopped.
   */
  updateByVersion(id: string, version: number, data: Prisma.GoalPlanUncheckedUpdateInput) {
    return db.goalPlan.updateMany({
      where: { id, version },
      data: { ...data, version: { increment: 1 } },
    })
  },

  /** Total monthly commitment from a member's live plans. */
  sumActiveAmounts(userId: string) {
    return db.goalPlan.aggregate({ where: { userId, status: 'ACTIVE' }, _sum: { amount: true } })
  },
}
