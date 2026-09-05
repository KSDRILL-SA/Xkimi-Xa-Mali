import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// `reconcileLedger` now checks the pool against its own rules and alerts when it
// is holding less than nothing, which pulls the alert service — and validated
// env — into this module's import graph. Neither belongs in a unit test of the
// ledger arithmetic.
vi.mock('@/services/alert.service', () => ({ raiseOperationalAlert: vi.fn().mockResolvedValue({}) }))
vi.mock('./alert.service', () => ({ raiseOperationalAlert: vi.fn().mockResolvedValue({}) }))
vi.mock('@/lib/env', () => ({ env: { ENCRYPTION_KEY: '0'.repeat(64), NEXTAUTH_URL: 'https://app.test' } }))

vi.mock('@/lib/db', () => ({
  db: {
    ledgerEntry: {
      create: vi.fn(),
      createMany: vi.fn(),
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

describe('reconcileLedger — self-heals the ledger, in bounded work', () => {
  const noTransactions = () =>
    mock(db.transaction.findMany).mockResolvedValueOnce([] as never).mockResolvedValueOnce([] as never)

  const noGoalPayments = () =>
    mock(db.goalPayment.findMany).mockResolvedValueOnce([] as never).mockResolvedValueOnce([] as never)

  const written = (n: number) => mock(db.ledgerEntry.createMany).mockResolvedValue({ count: n } as never)

  it('writes the whole backfill in one statement per direction, not one per row', async () => {
    // The property that matters: the cost of a nightly reconcile is a function
    // of the number of directions, not of every transaction ever settled.
    mock(db.transaction.findMany)
      .mockResolvedValueOnce(
        Array.from({ length: 250 }, (_, i) => ({ id: `s${i}`, amount: 100, contribution: { userId: 'u1' } })) as never,
      )
      .mockResolvedValueOnce(
        Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, amount: 50, contribution: { userId: 'u1' } })) as never,
      )
    noGoalPayments()
    written(0)

    await reconcileLedger()

    expect(db.ledgerEntry.createMany).toHaveBeenCalledTimes(2)
    expect(db.ledgerEntry.create).not.toHaveBeenCalled()
  })

  it('reports the rows that were genuinely new, not the rows it attempted', async () => {
    mock(db.transaction.findMany)
      .mockResolvedValueOnce([{ id: 's1', amount: 100, contribution: { userId: 'u1' } }] as never)
      .mockResolvedValueOnce([{ id: 'r1', amount: 50, contribution: { userId: 'u1' } }] as never)
    noGoalPayments()
    // The debit was already on record, so the statement inserts nothing for it.
    mock(db.ledgerEntry.createMany).mockImplementation(
      (async ({ data }: { data: Array<{ direction: string }> }) =>
        ({ count: data[0]?.direction === 'CREDIT' ? 1 : 0 })) as never,
    )

    expect(await reconcileLedger()).toEqual({ creditsPosted: 1, debitsPosted: 0 })
  })

  it('skips duplicates rather than failing on the ones already posted', async () => {
    // Idempotency moves from catching a unique violation per row to the
    // statement itself; without this flag a single existing entry would abort
    // the whole backfill.
    mock(db.transaction.findMany)
      .mockResolvedValueOnce([{ id: 's1', amount: 100, contribution: { userId: 'u1' } }] as never)
      .mockResolvedValueOnce([] as never)
    noGoalPayments()
    written(1)

    await reconcileLedger()

    expect(db.ledgerEntry.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    )
  })

  it('chunks a large backfill instead of sending one enormous statement', async () => {
    mock(db.transaction.findMany)
      .mockResolvedValueOnce(
        Array.from({ length: 2500 }, (_, i) => ({ id: `s${i}`, amount: 100, contribution: { userId: 'u1' } })) as never,
      )
      .mockResolvedValueOnce([] as never)
    noGoalPayments()
    written(1000)

    await reconcileLedger()

    // 2500 credits -> three chunks, plus one empty call for the debit side.
    const creditCalls = mock(db.ledgerEntry.createMany).mock.calls.filter(
      (c) => (c[0] as { data: Array<{ direction: string }> }).data[0]?.direction === 'CREDIT',
    )
    expect(creditCalls).toHaveLength(3)
    expect((creditCalls[0]![0] as { data: unknown[] }).data).toHaveLength(1000)
  })

  it('credits only genuine inflows — REVERSAL rows are stored SUCCESS but are money out', async () => {
    noTransactions()
    noGoalPayments()
    written(0)

    await reconcileLedger()

    const creditWhere = mock(db.transaction.findMany).mock.calls[0]![0] as { where: Record<string, unknown> }
    expect(creditWhere.where).toMatchObject({ status: 'SUCCESS', type: { not: 'REVERSAL' } })
  })

  it('backfills settled goal payments alongside contributions', async () => {
    noTransactions()
    mock(db.goalPayment.findMany)
      .mockResolvedValueOnce([{ id: 'gp-1', amount: 500, userId: 'u1', goal: { title: 'Braai Fund' } }] as never)
      .mockResolvedValueOnce([] as never)
    written(1)

    expect((await reconcileLedger()).creditsPosted).toBe(1)
    const [arg] = mock(db.ledgerEntry.createMany).mock.calls[0] as unknown as [{ data: Array<Record<string, unknown>> }]
    expect(arg.data[0]).toMatchObject({ refType: 'GOAL_PAYMENT', refId: 'gp-1', amount: 500, direction: 'CREDIT' })
  })

  it('debits a goal payment the bank pulled back after it cleared', async () => {
    noTransactions()
    mock(db.goalPayment.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: 'gp-9', amount: 500, userId: 'u1', goal: { title: 'Braai Fund' } }] as never)
    // Keyed on the rows rather than call order: the two directions are written
    // concurrently, and an empty side issues no statement at all.
    mock(db.ledgerEntry.createMany).mockImplementation(
      (async ({ data }: { data: unknown[] }) => ({ count: data.length })) as never,
    )

    const res = await reconcileLedger()
    expect(res).toEqual({ creditsPosted: 0, debitsPosted: 1 })
  })

  it('only debits reversals of payments that actually cleared', async () => {
    // A payment that went straight from PENDING to REVERSED never credited the
    // pool, so debiting it would drive the balance negative out of nothing.
    noTransactions()
    noGoalPayments()
    written(0)

    await reconcileLedger()

    const reversedWhere = mock(db.goalPayment.findMany).mock.calls[1]![0] as { where: Record<string, unknown> }
    expect(reversedWhere.where).toMatchObject({ status: 'REVERSED', processedAt: { not: null } })
  })

  it('writes nothing at all when there is nothing to backfill', async () => {
    noTransactions()
    noGoalPayments()
    written(0)

    expect(await reconcileLedger()).toEqual({ creditsPosted: 0, debitsPosted: 0 })
  })
})
