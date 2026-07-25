import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  db: {
    ledgerEntry: {
      create: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    transaction: { findMany: vi.fn() },
    goalPayment: { findMany: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import {
  postPoolCredit,
  postPoolDebit,
  getPoolBalance,
  reconcileLedger,
} from '@/services/ledger.service'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>

beforeEach(() => {
  vi.clearAllMocks()
  // No directed goal payments unless a test says otherwise.
  mock(db.goalPayment.findMany).mockResolvedValue([] as never)
})

describe('ledger posting — idempotent append-only (double-entry integrity)', () => {
  it('records a new entry and reports true', async () => {
    mock(db.ledgerEntry.create).mockResolvedValue({ id: 'l1' } as never)

    const posted = await postPoolCredit({ refType: 'TRANSACTION', refId: 't1', amount: 100 })

    expect(posted).toBe(true)
    expect(db.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ account: 'POOL', direction: 'CREDIT', amount: 100, refId: 't1' }),
      }),
    )
  })

  it('is a silent no-op when the same (refType, refId, direction) was already posted (P2002)', async () => {
    // The unique (refType, refId, direction) constraint makes a replayed post — from
    // the webhook and the reconciler both firing — record nothing the second time.
    mock(db.ledgerEntry.create).mockRejectedValue({ code: 'P2002' } as never)

    const posted = await postPoolDebit({ refType: 'TRANSACTION', refId: 't1', amount: 100 })

    expect(posted).toBe(false)
  })

  it('rethrows a non-uniqueness database error (never swallows real failures)', async () => {
    mock(db.ledgerEntry.create).mockRejectedValue({ code: 'P1001', message: 'db down' } as never)

    await expect(postPoolCredit({ refType: 'TRANSACTION', refId: 't1', amount: 100 })).rejects.toMatchObject({
      code: 'P1001',
    })
  })
})

describe('getPoolBalance', () => {
  it('computes balance as total credited minus total debited', async () => {
    mock(db.ledgerEntry.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: 1500 } } as never) // credits
      .mockResolvedValueOnce({ _sum: { amount: 400 } } as never) // debits
    mock(db.ledgerEntry.count).mockResolvedValue(7 as never)

    const res = await getPoolBalance()

    expect(res).toEqual({ balance: 1100, credited: 1500, debited: 400, entries: 7 })
  })

  it('treats a null sum (empty pool) as zero', async () => {
    mock(db.ledgerEntry.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: null } } as never)
      .mockResolvedValueOnce({ _sum: { amount: null } } as never)
    mock(db.ledgerEntry.count).mockResolvedValue(0 as never)

    const res = await getPoolBalance()

    expect(res).toEqual({ balance: 0, credited: 0, debited: 0, entries: 0 })
  })
})

describe('reconcileLedger — self-heals the ledger from settled transactions', () => {
  it('credits every SUCCESS and debits every REVERSED transaction, counting only new posts', async () => {
    mock(db.transaction.findMany)
      .mockResolvedValueOnce([
        { id: 's1', amount: 100, contribution: { userId: 'u1' } },
        { id: 's2', amount: 200, contribution: { userId: 'u2' } },
      ] as never) // SUCCESS
      .mockResolvedValueOnce([
        { id: 'r1', amount: 50, contribution: { userId: 'u1' } },
      ] as never) // REVERSED
    // First two credits are new; the third (a debit) was already posted (no-op).
    mock(db.ledgerEntry.create)
      .mockResolvedValueOnce({ id: 'l1' } as never)
      .mockResolvedValueOnce({ id: 'l2' } as never)
      .mockRejectedValueOnce({ code: 'P2002' } as never)

    const res = await reconcileLedger()

    expect(res).toEqual({ creditsPosted: 2, debitsPosted: 0 })
    expect(db.ledgerEntry.create).toHaveBeenCalledTimes(3)
  })

  it('credits only genuine inflows — REVERSAL rows (stored as SUCCESS) are excluded', async () => {
    mock(db.transaction.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)

    await reconcileLedger()

    // The credit query must filter out REVERSAL rows, otherwise a reversal would
    // be re-credited to the pool and cancel the debit of the original.
    const creditWhere = mock(db.transaction.findMany).mock.calls[0]![0] as { where: Record<string, unknown> }
    expect(creditWhere.where).toMatchObject({ status: 'SUCCESS', type: { not: 'REVERSAL' } })
  })

  it('backfills a settled goal payment whose real-time pool credit was missed', async () => {
    mock(db.transaction.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
    mock(db.goalPayment.findMany).mockResolvedValue([
      { id: 'gp-1', amount: 500, userId: 'u1', goal: { title: 'Braai Fund' } },
    ] as never)
    mock(db.ledgerEntry.create).mockResolvedValueOnce({ id: 'l1' } as never)

    const res = await reconcileLedger()

    expect(res.creditsPosted).toBe(1)
    expect(db.ledgerEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ refType: 'GOAL_PAYMENT', refId: 'gp-1', amount: 500, direction: 'CREDIT' }),
      }),
    )
  })

  it('only backfills settled goal payments — a pending one is never credited', async () => {
    mock(db.transaction.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)

    await reconcileLedger()

    const goalWhere = mock(db.goalPayment.findMany).mock.calls[0]![0] as { where: Record<string, unknown> }
    expect(goalWhere.where).toMatchObject({ status: 'SUCCESS' })
  })
})
