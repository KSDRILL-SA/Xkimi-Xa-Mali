import { Prisma } from '@prisma/client'
import type { PrismaClient, BudgetType } from '@prisma/client'
import { db } from '@/lib/db'

export type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

// ─── Contribution repository ────────────────────────────────────────────────
// Thin wrapper around db.contribution.* — zero business logic.

export const contributionRepo = {
  /** Paginated list with optional includes. */
  findMany(
    where: Prisma.ContributionWhereInput,
    opts: {
      orderBy?: Prisma.ContributionOrderByWithRelationInput[]
      skip?: number
      take?: number
      include?: Prisma.ContributionInclude
      select?: Prisma.ContributionSelect
    } = {},
  ) {
    if (opts.select) {
      return db.contribution.findMany({
        where,
        orderBy: opts.orderBy,
        skip: opts.skip,
        take: opts.take,
        select: opts.select,
      })
    }
    return db.contribution.findMany({
      where,
      orderBy: opts.orderBy,
      skip: opts.skip,
      take: opts.take,
      include: opts.include,
    })
  },

  /** Find a single contribution by ID. */
  findById(id: string, include?: Prisma.ContributionInclude) {
    return db.contribution.findUnique({ where: { id }, include })
  },

  /** Find by the compound unique key (userId + periodMonth + periodYear). */
  findByPeriod(userId: string, month: number, year: number) {
    return db.contribution.findUnique({
      where: {
        userId_periodMonth_periodYear: {
          userId,
          periodMonth: month,
          periodYear: year,
        },
      },
    })
  },

  /** Find contributions for a set of user IDs in a given period. */
  findByUserIds(
    userIds: string[],
    month: number,
    year: number,
    select?: Prisma.ContributionSelect,
  ) {
    return db.contribution.findMany({
      where: {
        userId: { in: userIds },
        periodMonth: month,
        periodYear: year,
      },
      select,
    })
  },

  /** Find overdue contributions (status PENDING, past due date). */
  findOverdue() {
    return db.contribution.findMany({
      where: {
        status: 'PENDING',
        dueDate: { lt: new Date() },
      },
    })
  },

  /** Create a single contribution record. */
  create(data: Prisma.ContributionCreateInput | Prisma.ContributionUncheckedCreateInput) {
    return db.contribution.create({ data: data as Prisma.ContributionCreateInput })
  },

  /** Create many contribution records at once. */
  createMany(
    data: Prisma.ContributionCreateManyInput[],
    skipDuplicates = false,
  ) {
    return db.contribution.createMany({ data, skipDuplicates })
  },

  /** Update many contributions matching a where clause. */
  updateMany(
    where: Prisma.ContributionWhereInput,
    data: Prisma.ContributionUpdateManyMutationInput,
  ) {
    return db.contribution.updateMany({ where, data })
  },

  /** Group contributions (pass full Prisma groupBy args). */
  groupBy<T extends Prisma.ContributionGroupByArgs>(args: T) {
    return (db.contribution.groupBy as unknown as (a: T) => ReturnType<typeof db.contribution.groupBy>)(args)
  },

  /** Aggregate _sum and _count over contributions. */
  aggregate(
    where: Prisma.ContributionWhereInput,
    fields: {
      _sum?: Prisma.ContributionSumAggregateInputType
      _count?: Prisma.ContributionCountAggregateInputType
    },
  ) {
    return db.contribution.aggregate({ where, ...fields })
  },

  /** Count contributions matching a where clause. */
  count(where: Prisma.ContributionWhereInput) {
    return db.contribution.count({ where })
  },

  /** Sum of amountPaid for contributions whose due date falls within a budget's active period. */
  async sumPaidInPeriod(
    userId: string,
    budget: { type: BudgetType; startDate: Date; endDate: Date | null },
  ): Promise<number> {
    const now = new Date()
    let gte: Date
    let lte: Date | undefined

    if (budget.type === 'MONTHLY') {
      gte = new Date(now.getFullYear(), now.getMonth(), 1)
      lte = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    } else if (budget.type === 'YEARLY') {
      gte = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1)
      lte = now
    } else {
      gte = budget.startDate
      lte = budget.endDate ?? undefined
    }

    const result = await db.contribution.aggregate({
      where: { userId, dueDate: { gte, ...(lte ? { lte } : {}) } },
      _sum: { amountPaid: true },
    })

    return Number(result._sum.amountPaid ?? 0)
  },

  // ─── Transaction-aware methods (accept optional tx) ──────────────────────

  /** findUnique inside a transaction context (for optimistic locking reads). */
  findUniqueWithVersion(id: string, tx: TxClient = db) {
    return tx.contribution.findUnique({ where: { id } })
  },

  /**
   * A member's periods that still owe something, oldest first.
   *
   * Used to place money that overshot the period it was recorded against.
   * WAIVED is excluded deliberately: leadership decided that month owes
   * nothing, and quietly filling it with somebody's overpayment would undo
   * that decision without anybody revisiting it.
   *
   * Ordered oldest first because arrears come before anything else. A member
   * who is behind on July and pays generously in September has settled July,
   * which is what they would say they had done.
   */
  findUnsettledByUser(userId: string, excludeId: string, tx: TxClient = db) {
    return tx.contribution.findMany({
      where: {
        userId,
        id: { not: excludeId },
        status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
      },
      orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }],
    })
  },

  /** Optimistic-lock update: only succeeds when version matches. */
  updateByVersion(
    id: string,
    version: number,
    data: Prisma.ContributionUpdateManyMutationInput,
    tx: TxClient = db,
  ) {
    return tx.contribution.updateMany({
      where: { id, version },
      data,
    })
  },
}

// ─── Thin db.$transaction wrapper ───────────────────────────────────────────

export function runTransaction<T>(
  fn: (tx: TxClient) => Promise<T>,
): Promise<T> {
  return db.$transaction(fn)
}
