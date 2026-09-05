import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Can the pool hold less than nothing?
//
// **No.** That is a decision, and it is recorded because until now nobody had
// made one. `getPoolBalance` returned `credited - debited` with no floor, no
// assertion and no alarm, so a negative pool would have rendered on the Fund
// page as an ordinary figure. An undecided invariant on a money page is how a
// wrong number reaches members with total confidence.
//
// The answer follows from what the directions mean here today: a CREDIT is
// money arriving, a DEBIT is money that arrived and was pulled back. There is
// no disbursement — no code path debits the pool for a payout — so every debit
// undoes a specific credit, and the sum cannot legitimately fall below zero.
//
// `reconcileLedger` was already relying on this without saying so. Its reversal
// query carries `processedAt: { not: null }`, commented "a payment that went
// straight from PENDING to REVERSED never credited the pool, and debiting it
// would drive the balance negative". The rule was enforced in one query and
// unstated everywhere else.
//
// The day the Foundation pays money out, a debit stops implying a prior credit
// and this needs revisiting — which is why the reasoning lives in the source
// next to the assertion, not only in a commit message.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  aggregate: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  raiseOperationalAlert: vi.fn().mockResolvedValue({}),
}))

vi.mock('@/lib/db', () => ({
  db: {
    ledgerEntry: { aggregate: mocks.aggregate, count: mocks.count, findMany: mocks.findMany },
  },
}))
vi.mock('@/services/alert.service', () => ({ raiseOperationalAlert: mocks.raiseOperationalAlert }))
vi.mock('./alert.service', () => ({ raiseOperationalAlert: mocks.raiseOperationalAlert }))

import { auditPoolInvariants } from '@/services/ledger.service'

/** `getPoolBalance` runs three aggregates in order: credits, debits, count. */
function balance(credited: number, debited: number) {
  mocks.aggregate
    .mockResolvedValueOnce({ _sum: { amount: credited } })
    .mockResolvedValueOnce({ _sum: { amount: debited } })
  mocks.count.mockResolvedValue(2)
}

/** `findMany` runs twice: debits, then credits. */
function entries(debits: unknown[], credits: unknown[]) {
  mocks.findMany.mockResolvedValueOnce(debits).mockResolvedValueOnce(credits)
}

beforeEach(() => vi.clearAllMocks())

describe('a healthy pool', () => {
  it('reports nothing when every debit undoes a credit', async () => {
    balance(1000, 250)
    entries(
      [{ refType: 'TRANSACTION', refId: 't1', amount: 250 }],
      [{ refType: 'TRANSACTION', refId: 't1' }, { refType: 'TRANSACTION', refId: 't2' }],
    )

    expect(await auditPoolInvariants()).toEqual([])
  })

  it('accepts a balance of exactly zero', async () => {
    // Everything that came in was reversed. Unusual, not wrong.
    balance(500, 500)
    entries(
      [{ refType: 'GOAL_PAYMENT', refId: 'g1', amount: 500 }],
      [{ refType: 'GOAL_PAYMENT', refId: 'g1' }],
    )

    expect(await auditPoolInvariants()).toEqual([])
  })
})

describe('a pool holding less than nothing', () => {
  it('reports a negative balance with the figures behind it', async () => {
    balance(1000, 1500)
    entries([], [])

    const breaches = await auditPoolInvariants()

    expect(breaches).toContainEqual({
      kind: 'NEGATIVE_BALANCE', balance: -500, credited: 1000, debited: 1500,
    })
  })

  it('names the debit that has no credit behind it', async () => {
    // The useful half. A negative balance is the symptom; a debit with no
    // matching credit is the cause, and naming the reference turns an alarm
    // into somewhere to start.
    balance(100, 400)
    entries(
      [
        { refType: 'TRANSACTION', refId: 't1', amount: 100 },
        { refType: 'GOAL_PAYMENT', refId: 'ghost', amount: 300 },
      ],
      [{ refType: 'TRANSACTION', refId: 't1' }],
    )

    const breaches = await auditPoolInvariants()

    expect(breaches).toContainEqual({
      kind: 'ORPHAN_DEBIT', refType: 'GOAL_PAYMENT', refId: 'ghost', amount: 300,
    })
  })

  it('does not confuse the same id under a different refType', async () => {
    // `(refType, refId, direction)` is the ledger's own key, so the check has
    // to use both halves. A transaction and a goal payment could share an id.
    balance(0, 200)
    entries(
      [{ refType: 'GOAL_PAYMENT', refId: 'x', amount: 200 }],
      [{ refType: 'TRANSACTION', refId: 'x' }],
    )

    const breaches = await auditPoolInvariants()

    expect(breaches.some((b) => b.kind === 'ORPHAN_DEBIT')).toBe(true)
  })

  it('reports every orphan, not just the first', async () => {
    balance(0, 300)
    entries(
      [
        { refType: 'TRANSACTION', refId: 'a', amount: 100 },
        { refType: 'TRANSACTION', refId: 'b', amount: 200 },
      ],
      [],
    )

    const breaches = await auditPoolInvariants()

    expect(breaches.filter((b) => b.kind === 'ORPHAN_DEBIT')).toHaveLength(2)
  })
})

describe('where the check runs', () => {
  const read = async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    return readFileSync(resolve(__dirname, '../services/ledger.service.ts'), 'utf8')
  }

  it('runs after the backfill, not before it', async () => {
    // Before the backfill a missing credit looks exactly like an orphan debit.
    // Alarming on a gap this run was about to close would train everyone to
    // ignore the alarm — which is worse than not having one.
    const src = await read()
    const fn = src.slice(src.indexOf('export async function reconcileLedger'))

    expect(fn.indexOf('postEntries')).toBeLessThan(fn.indexOf('raisePoolInvariantAlert()'))
  })

  it('raises it as critical', async () => {
    const src = await read()
    const alert = src.slice(src.indexOf('POOL_INVARIANT_BREACHED'))

    expect(alert.slice(0, 200)).toContain("severity: 'critical'")
  })

  it('cannot roll back the reconciliation by failing', async () => {
    // Best-effort, like every other post in this file: a failure to *report* a
    // problem must not undo the work that was fixing others.
    const src = await read()
    const fn = src.slice(src.indexOf('async function raisePoolInvariantAlert'))

    expect(fn.slice(0, 1400)).toMatch(/\.catch\(/)
  })
})
