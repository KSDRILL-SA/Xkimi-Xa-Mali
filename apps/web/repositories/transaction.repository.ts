import { Prisma } from '@prisma/client'
import type { PrismaClient, TransactionStatus } from '@prisma/client'
import { db } from '@/lib/db'

export type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>

// A REVERSAL row is stored with status SUCCESS (the reversal itself succeeded)
// but represents money flowing OUT, not a contribution inflow. Every "sum of
// successful inflows" MUST exclude it: reversing a payment marks the original
// REVERSED (dropping it from the sum), so also counting the +amount REVERSAL row
// nets the change to zero — leaving contributions still marked paid and the pool
// balance overstated. Use this fragment anywhere paid amounts are summed.
export const SUCCESSFUL_INFLOW: Prisma.TransactionWhereInput = {
  // SUCCESS only. UNKNOWN — submitted, outcome never confirmed — is money whose
  // fate nobody knows, and counting it would credit the pool, settle the
  // member's period and appear in their total for a debit the bank may never
  // have taken. The fund understates until the truth is known, which is the
  // safe direction to be wrong in.
  status: 'SUCCESS',
  type: { not: 'REVERSAL' },
}

/**
 * The same rule, spelled for raw SQL, where the Prisma filter above cannot
 * reach — a grouped aggregate compared against a column on the grouped row.
 *
 * These two must always say the same thing. They are deliberately adjacent so a
 * change to one is made staring at the other, and a test asserts they select the
 * same rows against a real database. `t` is the required table alias.
 */
export const SUCCESSFUL_INFLOW_SQL = `t.status = 'SUCCESS' AND t.type <> 'REVERSAL'`

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

  /**
   * Find a transaction by its idempotency key.
   *
   * `findUnique` rather than `findFirst`: the column carries a unique index, and
   * asking for it by that index is what makes a duplicate submission collapse
   * onto the first attempt instead of becoming a second debit.
   */
  findByIdempotencyKey(idempotencyKey: string) {
    return db.transaction.findUnique({ where: { idempotencyKey } })
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

  /**
   * Update a transaction only if it is still at `expectedStatus`.
   *
   * The guard against two webhook deliveries for the same transaction racing
   * each other: `processTransactionWebhook` reads the current status before
   * this call, outside any lock, so a second concurrent delivery can read the
   * same pre-update status and reach here too. An unconditional `update`
   * would let both proceed — into `recalculateContributionStatus` and, worse,
   * into the ledger posting after commit, posting the same credit twice.
   * `updateMany`'s `count` tells the caller whether it actually won this
   * compare-and-swap; only the winner should do the downstream work.
   */
  updateIfStatus(
    id: string,
    expectedStatus: TransactionStatus,
    data: Prisma.TransactionUpdateManyMutationInput,
    tx: TxClient = db,
  ) {
    return tx.transaction.updateMany({ where: { id, status: expectedStatus }, data })
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
