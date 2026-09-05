import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// What a second payment against an already-settled period means.
//
// **It stands, it is recorded, and somebody is told.**
//
// That is a decision, and it is written down because until now it was only a
// side effect of how the numbers happened to add up: the sum went past the
// amount due, `deriveContributionStatus` returned PAID (it already was), the
// row was updated, and nothing anywhere said so. The auditor's objection was
// exactly right — "you should never let this be an accidental consequence of
// database uniqueness."
//
// The alternatives, and why not:
//
//   - Reject it. The money has physically arrived; it is cash or an EFT an
//     admin is entering. Refusing to record it makes this system disagree with
//     the bank, which is the one thing a ledger may never do.
//   - Credit it forward automatically. That moves a member's money between
//     months with nobody deciding to. It may be the right outcome; it is not
//     the system's call to make quietly.
//   - Refund it automatically. Same objection, and it moves money.
//
// So leadership decides, as an explicit act with a name on it.
//
// This is reachable today and not hypothetically: offline recording is how all
// money arrives, and an admin entering the same cash handover twice under
// different references produces exactly this.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue(undefined),
  raiseOperationalAlert: vi.fn().mockResolvedValue({}),
}))

// The service pulls in validated env at import time, which a test process has
// no business holding. Same stub the sibling contribution suite uses.
vi.mock('@/lib/env', () => ({
  env: {
    ENCRYPTION_KEY: '0'.repeat(64),
    NETCASH_API_URL: 'https://netcash.test',
    NEXTAUTH_URL: 'https://app.test',
  },
}))

vi.mock('@/lib/cache', () => ({
  cache: { get: vi.fn().mockResolvedValue(null), set: vi.fn(), del: vi.fn() },
  CACHE_KEYS: { DASHBOARD_STATS: 'xxm:cache:stats' },
}))

// The service imports the gateway selector, which refuses to hand back the real
// Netcash adapter with no credentials — correctly, and not the subject here.
vi.mock('@/integrations/payment', () => ({
  paymentGateway: { submitOnceOffDebit: vi.fn(), mapTransactionStatus: vi.fn() },
}))

vi.mock('@/lib/inngest', () => ({
  inngest: { send: mocks.send },
  InngestEvents: { CONTRIBUTION_STATUS_CHANGED: 'xxm/contribution.status.changed' },
}))
vi.mock('./alert.service', () => ({ raiseOperationalAlert: mocks.raiseOperationalAlert }))
vi.mock('@/services/alert.service', () => ({ raiseOperationalAlert: mocks.raiseOperationalAlert }))

import { emitContributionStatusChange } from '@/services/contribution.service'

const BASE = { userId: 'u1', contributionId: 'c1', status: 'PAID' }

beforeEach(() => vi.clearAllMocks())

describe('an overpaid period is not absorbed silently', () => {
  it('raises an alert saying how far over it went', async () => {
    await emitContributionStatusChange({ ...BASE, overpaidBy: 250 })

    expect(mocks.raiseOperationalAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'CONTRIBUTION_OVERPAID',
        entityId: 'c1',
        payload: expect.objectContaining({ overpaidBy: 250 }),
      }),
    )
  })

  it('asks for a decision rather than reporting an incident', async () => {
    // Nobody is out of pocket and no money moved wrongly. Filing this as
    // critical alongside a failed debit run would devalue both.
    await emitContributionStatusChange({ ...BASE, overpaidBy: 250 })

    const alert = mocks.raiseOperationalAlert.mock.calls[0]![0] as { severity: string; body: string }
    expect(alert.severity).toBe('warning')
    expect(alert.body).toMatch(/carry the extra forward|return it/i)
  })

  it('still emits the status change', async () => {
    // The alert is additional. Everything downstream of a settled period —
    // receipts, statements, badges — still happens.
    await emitContributionStatusChange({ ...BASE, overpaidBy: 250 })

    expect(mocks.send).toHaveBeenCalledOnce()
  })

  it('does not let a failed alert stop the status change', async () => {
    // Reporting is secondary to recording, here as everywhere else.
    mocks.raiseOperationalAlert.mockRejectedValue(new Error('inbox down'))

    await expect(
      emitContributionStatusChange({ ...BASE, overpaidBy: 250 }),
    ).resolves.toBeUndefined()

    expect(mocks.send).toHaveBeenCalledOnce()
  })
})

describe('an ordinary settlement says nothing', () => {
  it('does not alert when the period was paid exactly', async () => {
    await emitContributionStatusChange({ ...BASE })

    expect(mocks.raiseOperationalAlert).not.toHaveBeenCalled()
    expect(mocks.send).toHaveBeenCalledOnce()
  })

  it('does not alert on an overdue period', async () => {
    await emitContributionStatusChange({ ...BASE, status: 'OVERDUE' })

    expect(mocks.raiseOperationalAlert).not.toHaveBeenCalled()
  })

  it('treats an overpayment of zero as no overpayment', async () => {
    // Paid to the cent. `overpaidBy: 0` must not read as truthy-adjacent.
    await emitContributionStatusChange({ ...BASE, overpaidBy: 0 })

    expect(mocks.raiseOperationalAlert).not.toHaveBeenCalled()
  })
})

describe('it fires on the crossing, not on every recalculation', () => {
  const read = async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    return readFileSync(resolve(__dirname, '../services/contribution.service.ts'), 'utf8')
  }

  it('compares the previous paid total against the amount due', async () => {
    // A period stays overpaid, and every job that touches the row recalculates
    // it. An alert that repeats each time is an alert everybody learns to
    // close — so the flag is set only when this settlement is the one that
    // took the period past what was owed.
    const src = await read()

    expect(src).toContain('newlyOverpaid')
    expect(src.replace(/\s+/g, ' ')).toMatch(
      /subtractZAR\(Number\(contribution\.amountPaid\), amountDue\) <= 0/,
    )
  })

  it('measures the overpayment through the money helpers', async () => {
    // `newAmountPaid - amountDue` is exactly what money-discipline.test.ts
    // exists to refuse.
    const src = await read()

    expect(src).toContain('const overpaidBy = subtractZAR(newAmountPaid, amountDue)')
  })
})
