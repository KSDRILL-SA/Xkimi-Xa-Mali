import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'

export type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

// ─── Goal repository ───────────────────────────────────────────────────────
// Thin wrapper around db.goal.* and db.goalProgress.* — zero business logic.

export const goalRepo = {
  /** Paginated list of goals. */
  findMany(
    where: Prisma.GoalWhereInput,
    opts: {
      orderBy?: Prisma.GoalOrderByWithRelationInput
      skip?: number
      take?: number
      select?: Prisma.GoalSelect
    } = {},
  ) {
    return db.goal.findMany({
      where,
      orderBy: opts.orderBy,
      skip: opts.skip,
      take: opts.take,
      ...(opts.select && { select: opts.select }),
    })
  },

  /** Find a single goal by ID. */
  findById(id: string, include?: Prisma.GoalInclude) {
    return db.goal.findUnique({ where: { id }, include })
  },

  /** Create a new goal. */
  create(data: Prisma.GoalUncheckedCreateInput) {
    return db.goal.create({ data })
  },

  /** Update a single goal by ID. */
  update(id: string, data: Prisma.GoalUpdateInput | Prisma.GoalUncheckedUpdateInput) {
    return db.goal.update({ where: { id }, data })
  },

  /** Delete a single goal by ID. */
  delete(id: string) {
    return db.goal.delete({ where: { id } })
  },

  /** Count goals matching a where clause. */
  count(where: Prisma.GoalWhereInput = {}) {
    return db.goal.count({ where })
  },

  /** Update many goals matching a where clause. */
  updateMany(
    where: Prisma.GoalWhereInput,
    data: Prisma.GoalUpdateManyMutationInput,
  ) {
    return db.goal.updateMany({ where, data })
  },

  // ─── GoalProgress methods ───────────────────────────────────────────────

  /** Create a progress record, optionally inside a transaction. */
  createProgress(
    data: Prisma.GoalProgressUncheckedCreateInput,
    tx: TxClient = db,
  ) {
    return tx.goalProgress.create({ data })
  },

  /** Paginated list of progress records for a goal. */
  findProgress(
    goalId: string,
    opts: {
      orderBy?: Prisma.GoalProgressOrderByWithRelationInput
      skip?: number
      take?: number
    } = {},
  ) {
    return db.goalProgress.findMany({
      where: { goalId },
      orderBy: opts.orderBy,
      skip: opts.skip,
      take: opts.take,
    })
  },

  /** Count progress records matching a where clause. */
  countProgress(where: Prisma.GoalProgressWhereInput) {
    return db.goalProgress.count({ where })
  },

  /** Sum of admin-recorded progress on a goal. */
  sumProgress(goalId: string) {
    return db.goalProgress.aggregate({ where: { goalId }, _sum: { amount: true } })
  },

  /** Update goal inside a transaction (optimistic lock via updateMany). */
  updateGoalInTx(
    where: Prisma.GoalWhereInput,
    data: Prisma.GoalUpdateManyMutationInput,
    tx: TxClient,
  ) {
    return tx.goal.updateMany({ where, data })
  },

  // ─── GoalPayment methods ────────────────────────────────────────────────

  /** Record a directed goal payment. */
  createPayment(data: Prisma.GoalPaymentUncheckedCreateInput) {
    return db.goalPayment.create({ data })
  },

  /**
   * Sum of settled (SUCCESS) directed payments toward a goal.
   *
   * SUCCESS is the only status that counts as money in the fund — a REVERSED
   * payment drops straight out of this sum, which is what makes a goal total
   * derived from it self-correcting. Any new "money paid toward a goal" query
   * must filter the same way or it will count reversals as inflows.
   */
  sumSuccessfulPayments(goalId: string) {
    return db.goalPayment.aggregate({ where: { goalId, status: 'SUCCESS' }, _sum: { amount: true } })
  },

  /** Find a directed payment by the gateway's reference (webhook settlement). */
  findPaymentByGatewayRef(gatewayRef: string) {
    return db.goalPayment.findFirst({ where: { gatewayRef } })
  },

  /** Update a directed payment's settlement state. */
  updatePayment(id: string, data: Prisma.GoalPaymentUncheckedUpdateInput) {
    return db.goalPayment.update({ where: { id }, data })
  },
}

// ─── Thin db.$transaction wrapper ───────────────────────────────────────────

export function runTransaction<T>(
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(fn)
}
