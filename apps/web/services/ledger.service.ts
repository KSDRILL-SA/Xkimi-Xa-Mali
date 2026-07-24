import { db } from '@/lib/db'
import { isUniqueViolation } from '@/lib/errors'

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

/** Current pool balance = total credited minus total debited. */
export async function getPoolBalance(): Promise<{ balance: number; credited: number; debited: number; entries: number }> {
  const [credits, debits, entries] = await Promise.all([
    db.ledgerEntry.aggregate({ where: { account: 'POOL', direction: 'CREDIT' }, _sum: { amount: true } }),
    db.ledgerEntry.aggregate({ where: { account: 'POOL', direction: 'DEBIT' }, _sum: { amount: true } }),
    db.ledgerEntry.count({ where: { account: 'POOL' } }),
  ])
  const credited = Number(credits._sum.amount ?? 0)
  const debited = Number(debits._sum.amount ?? 0)
  return { balance: credited - debited, credited, debited, entries }
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
 * Rebuild any missing ledger entries from the source-of-truth transactions.
 * Idempotent — only the gaps are filled. This guarantees the immutable ledger
 * can never permanently drift from settled money, even if a real-time hook is
 * ever missed. Safe to run on demand or on a schedule.
 */
export async function reconcileLedger(): Promise<{ creditsPosted: number; debitsPosted: number }> {
  const [successTx, reversedTx] = await Promise.all([
    db.transaction.findMany({ where: { status: 'SUCCESS' }, select: { id: true, amount: true, contribution: { select: { userId: true } } } }),
    db.transaction.findMany({ where: { status: 'REVERSED' }, select: { id: true, amount: true, contribution: { select: { userId: true } } } }),
  ])

  let creditsPosted = 0
  let debitsPosted = 0

  for (const t of successTx) {
    const posted = await postPoolCredit({ refType: 'TRANSACTION', refId: t.id, amount: Number(t.amount), memberId: t.contribution?.userId ?? null, description: 'Contribution received' })
    if (posted) creditsPosted++
  }
  for (const t of reversedTx) {
    const posted = await postPoolDebit({ refType: 'TRANSACTION', refId: t.id, amount: Number(t.amount), memberId: t.contribution?.userId ?? null, description: 'Contribution reversed' })
    if (posted) debitsPosted++
  }

  return { creditsPosted, debitsPosted }
}
