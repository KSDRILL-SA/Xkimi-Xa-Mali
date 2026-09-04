import { db } from '@/lib/db'
import { isUniqueViolation } from '@/lib/errors'
import { SUCCESSFUL_INFLOW } from '@/repositories/transaction.repository'
import { subtractZAR, roundZAR } from '@/lib/money'

type Direction = 'CREDIT' | 'DEBIT'

export type LedgerEntryView = {
  id: string
  direction: Direction
  amount: number
  refType: string
  refId: string
  memberId: string | null
  description: string | null
  createdAt: string
}

type PostParams = {
  refType: string
  refId: string
  amount: number
  memberId?: string | null
  description?: string
}

/**
 * Append one immutable entry to the pool ledger. Idempotent: the unique
 * (refType, refId, direction) constraint means a repeated post (from the
 * webhook hook and/or the reconciler) is silently a no-op. Returns true when a
 * new entry was written.
 */
async function postEntry(direction: Direction, p: PostParams): Promise<boolean> {
  try {
    await db.ledgerEntry.create({
      data: {
        account: 'POOL',
        direction,
        amount: p.amount,
        refType: p.refType,
        refId: p.refId,
        memberId: p.memberId ?? null,
        description: p.description ?? null,
      },
    })
    return true
  } catch (e) {
    if (isUniqueViolation(e)) return false
    throw e
  }
}

export const postPoolCredit = (p: PostParams) => postEntry('CREDIT', p)
export const postPoolDebit = (p: PostParams) => postEntry('DEBIT', p)

/**
 * Post many entries at once, skipping any that already exist.
 *
 * The reconciler previously wrote these one at a time and let the unique
 * constraint reject the duplicates — correct, but it meant one round trip per
 * row, over the whole history, every night. Measured against 12 000 rows the
 * per-row loop took 6.2s inside Postgres against 0.4s for a single statement,
 * and from the application each of those rows is a separate trip to the
 * database, so the real gap is far wider.
 *
 * Chunked rather than sent as one enormous statement: a single INSERT carrying
 * a hundred thousand rows is its own problem. This keeps each statement bounded
 * while still turning N round trips into N/1000.
 *
 * Returns how many rows were genuinely new, which is what the reconciler
 * reports — `skipDuplicates` makes the count reflect inserts, not attempts.
 */
const BACKFILL_CHUNK = 1_000

async function postEntries(direction: Direction, entries: PostParams[]): Promise<number> {
  let written = 0

  for (let i = 0; i < entries.length; i += BACKFILL_CHUNK) {
    const chunk = entries.slice(i, i + BACKFILL_CHUNK)
    const { count } = await db.ledgerEntry.createMany({
      data: chunk.map((p) => ({
        account: 'POOL',
        direction,
        amount: p.amount,
        refType: p.refType,
        refId: p.refId,
        memberId: p.memberId ?? null,
        description: p.description ?? null,
      })),
      skipDuplicates: true,
    })
    written += count
  }

  return written
}

/** Current pool balance = total credited minus total debited. */
export async function getPoolBalance(): Promise<{ balance: number; credited: number; debited: number; entries: number }> {
  const [credits, debits, entries] = await Promise.all([
    db.ledgerEntry.aggregate({ where: { account: 'POOL', direction: 'CREDIT' }, _sum: { amount: true } }),
    db.ledgerEntry.aggregate({ where: { account: 'POOL', direction: 'DEBIT' }, _sum: { amount: true } }),
    db.ledgerEntry.count({ where: { account: 'POOL' } }),
  ])
  const credited = Number(credits._sum.amount ?? 0)
  const debited = Number(debits._sum.amount ?? 0)
  return { balance: subtractZAR(credited, debited), credited, debited, entries }
}

/** Paged, newest-first ledger feed. */
export async function getLedger(opts: { page?: number; limit?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1)
  const limit = Math.min(100, Math.max(1, opts.limit ?? 50))

  const [rows, total] = await Promise.all([
    db.ledgerEntry.findMany({
      where: { account: 'POOL' },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, direction: true, amount: true, refType: true, refId: true, memberId: true, description: true, createdAt: true },
    }),
    db.ledgerEntry.count({ where: { account: 'POOL' } }),
  ])

  const items: LedgerEntryView[] = rows.map((r) => ({
    id: r.id,
    direction: r.direction as Direction,
    amount: Number(r.amount),
    refType: r.refType,
    refId: r.refId,
    memberId: r.memberId,
    description: r.description,
    createdAt: r.createdAt.toISOString(),
  }))

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

/**
 * Rebuild any missing ledger entries from the source-of-truth money records —
 * settled transactions (monthly contributions) and settled directed goal
 * payments. Idempotent — only the gaps are filled. This guarantees the immutable
 * ledger can never permanently drift from settled money, even if a real-time
 * hook is ever missed. Safe to run on demand or on a schedule.
 */
export async function reconcileLedger(): Promise<{ creditsPosted: number; debitsPosted: number }> {
  const [successTx, reversedTx, goalPayments, reversedGoalPayments] = await Promise.all([
    db.transaction.findMany({ where: SUCCESSFUL_INFLOW, select: { id: true, amount: true, contribution: { select: { userId: true } } } }),
    db.transaction.findMany({ where: { status: 'REVERSED' }, select: { id: true, amount: true, contribution: { select: { userId: true } } } }),
    db.goalPayment.findMany({ where: { status: 'SUCCESS' }, select: { id: true, amount: true, userId: true, goal: { select: { title: true } } } }),
    // Only reversals of payments that actually cleared: processedAt is stamped
    // by settlement and never cleared, so `not: null` means a CREDIT exists to
    // undo. A payment that went straight from PENDING to REVERSED never credited
    // the pool, and debiting it would drive the balance negative.
    db.goalPayment.findMany({ where: { status: 'REVERSED', processedAt: { not: null } }, select: { id: true, amount: true, userId: true, goal: { select: { title: true } } } }),
  ])

  // Directed goal payments credit the pool in real time; the backfill catches a
  // best-effort post that failed at settlement. A goal payment the bank pulled
  // back after it cleared gets a debit alongside its original credit, which
  // stays as the immutable record of what happened.
  const [creditsPosted, debitsPosted] = await Promise.all([
    postEntries('CREDIT', [
      ...successTx.map((t) => ({
        refType: 'TRANSACTION', refId: t.id, amount: Number(t.amount),
        memberId: t.contribution?.userId ?? null, description: 'Contribution received',
      })),
      ...goalPayments.map((p) => ({
        refType: 'GOAL_PAYMENT', refId: p.id, amount: Number(p.amount),
        memberId: p.userId, description: `Goal contribution: ${p.goal.title}`,
      })),
    ]),
    postEntries('DEBIT', [
      ...reversedTx.map((t) => ({
        refType: 'TRANSACTION', refId: t.id, amount: Number(t.amount),
        memberId: t.contribution?.userId ?? null, description: 'Contribution reversed',
      })),
      ...reversedGoalPayments.map((p) => ({
        refType: 'GOAL_PAYMENT', refId: p.id, amount: Number(p.amount),
        memberId: p.userId, description: `Goal contribution reversed: ${p.goal.title}`,
      })),
    ]),
  ])

  return { creditsPosted, debitsPosted }
}

// ─── The fund, as members see it ──────────────────────────────────────────────

/**
 * `refType` values the pool ledger carries, and what each one means.
 *
 * `TRANSACTION` is a monthly contribution settling; `GOAL_PAYMENT` is money a
 * member directed at a named goal. Both are written by `reconcileLedger` above
 * and by the real-time hooks, so this split is not a new derivation — it is a
 * distinction the ledger has always recorded and nothing has ever read.
 */
const SOURCE_MONTHLY = 'TRANSACTION'
const SOURCE_GOAL = 'GOAL_PAYMENT'

export type FundSource = {
  credited: number
  debited: number
  net: number
}

export type FundOverview = {
  /** Everything the group holds: credits minus debits, across both sources. */
  balance: number
  monthly: FundSource
  goals: FundSource
  /** Settled money per goal, newest goals first, largest first within that. */
  perGoal: { id: string; title: string; raised: number; target: number; status: string; isPrimary: boolean }[]
  entries: number
}

/**
 * The whole fund, split by where the money came from.
 *
 * ── Why this reads the ledger and not the source tables ────────────────────
 *
 * `Contribution.amountPaid` and `GoalPayment.amount` are each true about their
 * own kind of money, but neither knows about the other, and adding them in the
 * page would be a third place that has to stay in step with reversals. The
 * ledger is the one record that already carries both, is append-only, and has
 * a reconciler that rebuilds it from the source tables — so a figure derived
 * here cannot silently disagree with the money.
 *
 * Reversals are subtracted rather than hidden: a member who sees a total that
 * quietly excludes a reversed payment has no way to understand why the number
 * moved. `credited` and `debited` are both returned so a page can say so.
 */
export async function getFundOverview(): Promise<FundOverview> {
  const [bySource, entries, goals] = await Promise.all([
    db.ledgerEntry.groupBy({
      by: ['refType', 'direction'],
      where: { account: 'POOL' },
      _sum: { amount: true },
    }),
    db.ledgerEntry.count({ where: { account: 'POOL' } }),
    db.goal.findMany({
      // FAILED included deliberately: a goal that missed its deadline still
      // holds every rand raised into it, and that money is in the balance
      // above. Listing only the goals that succeeded would show a total the
      // rows beneath it do not add up to.
      where: { status: { in: ['ACTIVE', 'ACHIEVED', 'FAILED'] } },
      select: {
        id: true,
        title: true,
        currentAmount: true,
        targetAmount: true,
        status: true,
        isPrimary: true,
      },
      orderBy: [{ isPrimary: 'desc' }, { currentAmount: 'desc' }],
    }),
  ])

  const sum = (refType: string, direction: Direction) =>
    Number(
      bySource.find((r) => r.refType === refType && r.direction === direction)?._sum.amount ?? 0,
    )

  const build = (refType: string): FundSource => {
    const credited = sum(refType, 'CREDIT')
    const debited = sum(refType, 'DEBIT')
    return { credited, debited, net: subtractZAR(credited, debited) }
  }

  const monthly = build(SOURCE_MONTHLY)
  const goalsSource = build(SOURCE_GOAL)

  return {
    balance: roundZAR(monthly.net + goalsSource.net),
    monthly,
    goals: goalsSource,
    perGoal: goals.map((g) => ({
      id: g.id,
      title: g.title,
      raised: Number(g.currentAmount),
      target: Number(g.targetAmount),
      status: g.status,
      isPrimary: g.isPrimary,
    })),
    entries,
  }
}

export type MemberFundShare = {
  /** Monthly contributions that settled, less any that were reversed. */
  monthly: number
  /** Directed goal payments that settled, less any that were reversed. */
  goals: number
  /** What this member has actually given the Foundation, in total. */
  total: number
}

/**
 * One member's share of the fund, split the same way.
 *
 * ── The number this exists to correct ──────────────────────────────────────
 *
 * `getMemberSummary().totalContributed` sums `Contribution.amountPaid` and
 * nothing else, and the dashboard labelled it **"Total contributed"**. A
 * member who had also put money into a goal was shown a total that excluded
 * it — real money they gave the Foundation, appearing in no total anywhere on
 * the member side.
 *
 * Read from the ledger, and scoped by `memberId`, so it is the same arithmetic
 * as the group figure above rather than a parallel one.
 */
export async function getMemberFundShare(memberId: string): Promise<MemberFundShare> {
  const rows = await db.ledgerEntry.groupBy({
    by: ['refType', 'direction'],
    where: { account: 'POOL', memberId },
    _sum: { amount: true },
  })

  const net = (refType: string) => {
    const credited = Number(
      rows.find((r) => r.refType === refType && r.direction === 'CREDIT')?._sum.amount ?? 0,
    )
    const debited = Number(
      rows.find((r) => r.refType === refType && r.direction === 'DEBIT')?._sum.amount ?? 0,
    )
    return subtractZAR(credited, debited)
  }

  const monthly = net(SOURCE_MONTHLY)
  const goals = net(SOURCE_GOAL)

  return { monthly, goals, total: roundZAR(monthly + goals) }
}
