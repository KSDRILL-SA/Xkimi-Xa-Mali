import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
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

  /** Group contributions by status. */
  groupBy(where: Prisma.ContributionWhereInput) {
    return db.contribution.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    })
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

  // ─── Transaction-aware methods (accept optional tx) ──────────────────────

  /** findUnique inside a transaction context (for optimistic locking reads). */
  findUniqueWithVersion(id: string, tx: TxClient = db) {
    return tx.contribution.findUnique({ where: { id } })
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
