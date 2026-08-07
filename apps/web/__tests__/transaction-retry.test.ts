import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * The retry job, end to end, through a stub step runner.
 *
 * This is the whole recovery path for a collection that did not happen. The
 * debit run writes a FAILED transaction specifically so this picks it up, so
 * that fix is only as good as this job — and neither had a test.
 */

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  txUpdate: vi.fn(),
  dbTransaction: vi.fn(),
  submitScheduledDebit: vi.fn(),
  submitOnceOffDebit: vi.fn(),
  recalculate: vi.fn(),
  writeAuditLog: vi.fn(),
  queueNotification: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: { NEXTAUTH_URL: 'https://app.example.test' } }))
vi.mock('@/lib/inngest', () => ({ inngest: { createFunction: () => ({}) } }))
vi.mock('@/lib/db', () => ({
  Prisma: {},
  db: {
    transaction: { findMany: mocks.findMany, update: mocks.txUpdate },
    $transaction: mocks.dbTransaction,
  },
}))
vi.mock('@/integrations/payment', () => ({
  paymentGateway: {
    submitScheduledDebit: mocks.submitScheduledDebit,
    submitOnceOffDebit: mocks.submitOnceOffDebit,
  },
}))
vi.mock('@/lib/group-account', () => ({ debitAmountWithFee: (n: number) => n }))
vi.mock('@/services/contribution.service', () => ({ recalculateContributionStatus: mocks.recalculate }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/services/notification.service', () => ({ queueNotification: mocks.queueNotification }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { executeTransactionRetry } from '@/inngest/functions/transaction-retry-failed'

const step = { run: async <T>(_id: string, fn: () => Promise<T> | T): Promise<T> => fn() }

/** A FAILED row shaped exactly as the debit run writes one. */
function failedTx(over: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    amount: 500,
    type: 'DEBIT_ORDER',
    retryCount: 0,
    idempotencyKey: 'debit:run:mandate-1:2026-08',
    gatewayRef: null,
    contributionId: 'contrib-1',
    mandate: { id: 'mandate-1', netcashMandateId: 'nc-1', status: 'ACTIVE', userId: 'user-1' },
    contribution: { id: 'contrib-1', status: 'PENDING' },
    ...over,
  }
}

/** The data passed to the transaction.update inside db.$transaction. */
function updatedInsideTx() {
  return mocks.dbTransaction.mock.calls[0]?.[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.txUpdate.mockResolvedValue({})
  mocks.recalculate.mockResolvedValue(undefined)
  mocks.writeAuditLog.mockResolvedValue(undefined)
  mocks.queueNotification.mockResolvedValue(undefined)
  // Run the callback against a stub client so we can read what it wrote.
  mocks.dbTransaction.mockImplementation(async (fn: (c: unknown) => Promise<unknown>) =>
    fn({ transaction: { update: mocks.txUpdate } }),
  )
})

describe('executeTransactionRetry — picking up what the debit run left', () => {
  it('finds FAILED rows under the attempt cap, inside the window', async () => {
    mocks.findMany.mockResolvedValue([])
    await executeTransactionRetry(step)

    const where = mocks.findMany.mock.calls[0][0].where
    expect(where.status).toBe('FAILED')
    expect(where.retryCount).toEqual({ lt: 3 })
    expect(where.createdAt.gte).toBeInstanceOf(Date)
  })

  it('resubmits under a distinct key so the original cannot double-charge', async () => {
    mocks.findMany.mockResolvedValue([failedTx()])
    mocks.submitScheduledDebit.mockResolvedValue({ status: 'SUCCESS', transactionRef: 'ref' })

    await executeTransactionRetry(step)

    expect(mocks.submitScheduledDebit).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'retry:debit:run:mandate-1:2026-08:1' }),
    )
  })

  it('retries a failure the gateway never received, marked as infrastructure', async () => {
    // Exactly what debit-run writes when the gateway is unreachable.
    mocks.findMany.mockResolvedValue([
      failedTx({ failureReason: 'INFRASTRUCTURE: gateway unreachable' }),
    ])
    mocks.submitScheduledDebit.mockResolvedValue({ status: 'SUCCESS', transactionRef: 'ref' })

    const summary = await executeTransactionRetry(step)

    expect(summary.retried).toBe(1)
    expect(mocks.recalculate).toHaveBeenCalledWith('contrib-1', expect.anything())
  })
})

describe('executeTransactionRetry — what each gateway answer means', () => {
  beforeEach(() => mocks.findMany.mockResolvedValue([failedTx()]))

  it('settles a successful retry and tells the member', async () => {
    mocks.submitScheduledDebit.mockResolvedValue({ status: 'SUCCESS', transactionRef: 'ref' })

    const summary = await executeTransactionRetry(step)

    expect(mocks.txUpdate.mock.calls[0][0].data).toMatchObject({ status: 'SUCCESS', retryCount: 1 })
    expect(mocks.queueNotification.mock.calls[0][0].templateSlug).toBe('debit-success')
    expect(summary.retried).toBe(1)
  })

  it('keeps a declined retry FAILED so it can be tried again', async () => {
    // Writing PENDING here removes the row from the `status: FAILED` pool this
    // job queries — so it is never retried again, and the member is never told.
    mocks.submitScheduledDebit.mockResolvedValue({ status: 'FAILED', reason: 'insufficient funds' })

    await executeTransactionRetry(step)

    expect(mocks.txUpdate.mock.calls[0][0].data.status).toBe('FAILED')
  })

  it('keeps the reason a declined retry gave, rather than erasing it', async () => {
    mocks.submitScheduledDebit.mockResolvedValue({ status: 'FAILED', reason: 'insufficient funds' })

    await executeTransactionRetry(step)

    expect(mocks.txUpdate.mock.calls[0][0].data.failureReason).toBe('insufficient funds')
  })

  it('does not count a decline as a successful retry, or as skipped', async () => {
    mocks.submitScheduledDebit.mockResolvedValue({ status: 'FAILED', reason: 'insufficient funds' })

    const summary = await executeTransactionRetry(step)

    expect(summary).toMatchObject({ retried: 0, declined: 1, skipped: 0, errored: 0 })
    // A TRANSACTION_RETRIED entry for money that never moved is a false record.
    expect(mocks.writeAuditLog).not.toHaveBeenCalled()
  })

  it('leaves a genuinely pending submission pending, awaiting its webhook', async () => {
    mocks.submitScheduledDebit.mockResolvedValue({ status: 'PENDING' })

    await executeTransactionRetry(step)

    expect(mocks.txUpdate.mock.calls[0][0].data.status).toBe('PENDING')
    expect(mocks.queueNotification).not.toHaveBeenCalled()
  })

  it('records an unreachable gateway against the attempt count', async () => {
    mocks.submitScheduledDebit.mockRejectedValue(new Error('gateway unreachable'))

    const summary = await executeTransactionRetry(step)

    expect(mocks.txUpdate.mock.calls[0][0].data).toMatchObject({ retryCount: 1 })
    expect(mocks.txUpdate.mock.calls[0][0].data.failureReason).toContain('gateway unreachable')
    expect(summary).toMatchObject({ retried: 0, errored: 1, declined: 0, skipped: 0 })
  })
})

describe('executeTransactionRetry — rows it must not touch', () => {
  it.each([
    ['a cancelled mandate', { mandate: { id: 'm', netcashMandateId: 'nc', status: 'CANCELLED', userId: 'u' } }],
    ['a mandate with no gateway id', { mandate: { id: 'm', netcashMandateId: null, status: 'ACTIVE', userId: 'u' } }],
    ['a contribution already paid', { contribution: { id: 'c', status: 'PAID' } }],
  ])('never charges %s', async (_label, over) => {
    mocks.findMany.mockResolvedValue([failedTx(over)])

    const summary = await executeTransactionRetry(step)

    expect(mocks.submitScheduledDebit).not.toHaveBeenCalled()
    expect(summary.skipped).toBe(1)
  })

  it('uses the once-off path for a manual payment, not the scheduled one', async () => {
    mocks.findMany.mockResolvedValue([failedTx({ type: 'MANUAL' })])
    mocks.submitOnceOffDebit.mockResolvedValue({ status: 'SUCCESS' })

    await executeTransactionRetry(step)

    expect(mocks.submitOnceOffDebit).toHaveBeenCalled()
    expect(mocks.submitScheduledDebit).not.toHaveBeenCalled()
  })
})
