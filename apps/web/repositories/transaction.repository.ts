import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'

export type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

// ─── Transaction repository ─────────────────────────────────────────────────
// Thin wrapper around db.transaction.* — zero business logic.

export const transactionRepo = {
  /** Create a transaction record, optionally inside a db.$transaction. */
  create(
    data: Prisma.TransactionCreateInput | Prisma.TransactionUncheckedCreateInput,
    tx: TxClient = db,
  ) {
    return tx.transaction.create({ data: data as Prisma.TransactionCreateInput })
  },

  /** Find a transaction by its gateway reference. */
  findByGatewayRef(ref: string, include?: Prisma.TransactionInclude) {
    return db.transaction.findFirst({
      where: { gatewayRef: ref },
      include,
    })
  },

  /** Find a transaction by ID. */
  findById(id: string, include?: Prisma.TransactionInclude) {
    return db.transaction.findUnique({ where: { id }, include })
  },

  /** Update a transaction by ID, optionally inside a db.$transaction. */
  update(
    id: string,
    data: Prisma.TransactionUpdateInput,
    tx: TxClient = db,
  ) {
    return tx.transaction.update({ where: { id }, data })
  },

  /** Paginated list of transactions with optional includes. */
  findMany(
    where: Prisma.TransactionWhereInput,
    opts: {
      orderBy?: Prisma.TransactionOrderByWithRelationInput | Prisma.TransactionOrderByWithRelationInput[]
      skip?: number
      take?: number
      include?: Prisma.TransactionInclude
      select?: Prisma.TransactionSelect
    } = {},
  ) {
    if (opts.select) {
      return db.transaction.findMany({
        where,
        orderBy: opts.orderBy,
        skip: opts.skip,
        take: opts.take,
        select: opts.select,
      })
    }
    return db.transaction.findMany({
      where,
      orderBy: opts.orderBy,
      skip: opts.skip,
      take: opts.take,
      include: opts.include,
    })
  },

  /** Count transactions matching a where clause. */
  count(where: Prisma.TransactionWhereInput) {
    return db.transaction.count({ where })
  },

  /** Aggregate _sum over transaction amounts, optionally inside a db.$transaction. */
  aggregate(where: Prisma.TransactionWhereInput, tx: TxClient = db) {
    return tx.transaction.aggregate({
      where,
      _sum: { amount: true },
    })
  },
}
