import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * The delayed debit, end to end, through a stub step runner.
 *
 * This is the debit a member asked to move. Getting it wrong is not a missed
 * collection like the other jobs — it is charging someone on a day they said
 * they could not afford, or never charging them after they asked for a date
 * and were told it was set.
 */

const mocks = vi.hoisted(() => ({
  mandateFindUnique: vi.fn(),
  contribFindUnique: vi.fn(),
  contribCreate: vi.fn(),
  txCreate: vi.fn(),
  submit: vi.fn(),
  recalculate: vi.fn(),
  queueNotification: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: { NEXTAUTH_URL: 'https://app.example.test' } }))
vi.mock('@/lib/inngest', () => ({ inngest: { createFunction: () => ({}) } }))
vi.mock('@/lib/db', () => ({
  Prisma: {},
  db: {
    paymentMandate: { findUnique: mocks.mandateFindUnique },
    contribution: { findUnique: mocks.contribFindUnique, create: mocks.contribCreate },
    transaction: { create: mocks.txCreate },
  },
}))
vi.mock('@/integrations/payment', () => ({
  paymentGateway: { submitScheduledDebit: mocks.submit },
}))
vi.mock('@/lib/group-account', () => ({ debitAmountWithFee: (n: number) => n }))
vi.mock('@/services/contribution.service', () => ({ recalculateContributionStatus: mocks.recalculate }))
vi.mock('@/services/notification.service', () => ({ queueNotification: mocks.queueNotification }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: mocks.error, debug: vi.fn() },
}))

import { executeMandateDelay } from '@/inngest/functions/mandate-delay-handler'

const step = {
  run: async <T>(_id: string, fn: () => Promise<T> | T): Promise<T> => fn(),
  sleepUntil: async () => undefined,
}

const event = { data: { mandateId: 'mandate-1', userId: 'user-1', newDate: '2026-08-20' } }

const slugs = () => mocks.queueNotification.mock.calls.map((c) => c[0].templateSlug)
const createdTx = () => mocks.txCreate.mock.calls[0]?.[0].data

beforeEach(() => {
  vi.clearAllMocks()
  mocks.mandateFindUnique.mockResolvedValue({
    id: 'mandate-1',
    amount: 500,
    status: 'ACTIVE',
    netcashMandateId: 'nc-1',
    user: { firstName: 'Kurhula' },
  })
  mocks.contribFindUnique.mockResolvedValue(null)
  mocks.contribCreate.mockResolvedValue({ id: 'contrib-1', status: 'PENDING' })
  mocks.txCreate.mockResolvedValue({ id: 'tx-1' })
  mocks.recalculate.mockResolvedValue(undefined)
  mocks.queueNotification.mockResolvedValue(undefined)
})

describe('executeMandateDelay — the day the member chose', () => {
  it('warns them the day before, then charges on the date', async () => {
    mocks.submit.mockResolvedValue({ status: 'SUCCESS', transactionRef: 'ref' })

    await executeMandateDelay(step, event)

    expect(slugs()).toEqual(['debit-tomorrow-warning', 'debit-success'])
    expect(mocks.submit).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'debit:delay:mandate-1:2026-08' }),
    )
  })

  it('settles a successful charge against the contribution', async () => {
    mocks.submit.mockResolvedValue({ status: 'SUCCESS', transactionRef: 'ref' })

    const result = await executeMandateDelay(step, event)

    expect(createdTx()).toMatchObject({ status: 'SUCCESS', idempotencyKey: 'debit:delay:mandate-1:2026-08' })
    expect(mocks.recalculate).toHaveBeenCalledWith('contrib-1')
    expect(result).toEqual({ outcome: 'SUCCESS' })
  })
})

describe('executeMandateDelay — when the bank declines', () => {
  beforeEach(() => { mocks.submit.mockResolvedValue({ status: 'FAILED', reason: 'insufficient funds' }) })

  it('records FAILED, not PENDING', async () => {
    // PENDING is invisible to transaction-retry-failed, so the debit the member
    // moved would never be retried — and they were told it was processing.
    await executeMandateDelay(step, event)

    expect(createdTx().status).toBe('FAILED')
    expect(createdTx().failureReason).toBe('insufficient funds')
  })

  it('tells them on both channels, by name, with somewhere to pay', async () => {
    await executeMandateDelay(step, event)

    expect(slugs()).toEqual(['debit-tomorrow-warning', 'payment-failed-sms', 'payment-failed-email'])
    const { payload } = mocks.queueNotification.mock.calls[1][0]
    expect(payload.firstName).toBe('Kurhula')
    expect(payload.url).toBe('https://app.example.test/dashboard/contribute')
  })

  it('does not tell them the debit is being processed', async () => {
    await executeMandateDelay(step, event)
    expect(slugs()).not.toContain('debit-pending')
  })
})

describe('executeMandateDelay — when the gateway cannot be reached', () => {
  beforeEach(() => {
    // Rejected lazily, at call time. mockRejectedValue builds the promise
    // immediately, and nothing consumes it until the job runs.
    mocks.submit.mockImplementation(() => Promise.reject(new Error('gateway unreachable')))
  })

  it('leaves a FAILED row the retry job can recover', async () => {
    const result = await executeMandateDelay(step, event)

    expect(createdTx()).toMatchObject({ status: 'FAILED' })
    expect(createdTx().failureReason.startsWith('INFRASTRUCTURE: ')).toBe(true)
    expect(result).toEqual({ outcome: 'infrastructure' })
  })

  it('says nothing to the member about a decline that did not happen', async () => {
    await executeMandateDelay(step, event)

    expect(slugs()).not.toContain('payment-failed-sms')
    expect(mocks.error).toHaveBeenCalled()
  })
})

describe('executeMandateDelay — charges it must not make', () => {
  it.each([
    ['the mandate was cancelled while waiting', { status: 'CANCELLED' }],
    ['the mandate lost its gateway id', { netcashMandateId: null }],
  ])('does not charge when %s', async (_label, over) => {
    mocks.mandateFindUnique.mockResolvedValue({
      id: 'mandate-1', amount: 500, status: 'ACTIVE', netcashMandateId: 'nc-1',
      user: { firstName: 'Kurhula' }, ...over,
    })

    await executeMandateDelay(step, event)

    expect(mocks.submit).not.toHaveBeenCalled()
    expect(mocks.txCreate).not.toHaveBeenCalled()
  })

  it('does not charge a contribution already paid', async () => {
    mocks.contribFindUnique.mockResolvedValue({ id: 'contrib-1', status: 'PAID' })

    await executeMandateDelay(step, event)

    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('does not charge when the mandate is gone entirely', async () => {
    mocks.mandateFindUnique.mockResolvedValue(null)

    await executeMandateDelay(step, event)

    expect(mocks.submit).not.toHaveBeenCalled()
  })
})
