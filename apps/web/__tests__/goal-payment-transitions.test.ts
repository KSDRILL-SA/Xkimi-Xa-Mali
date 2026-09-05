import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Two different problems that look like one, on the same handler.
//
// **Deduplication** stops the SAME webhook event being processed twice, and
// `ProcessedWebhookEvent` with its `(source, eventKey)` unique constraint does
// that well — it was endorsed twice by the audit.
//
// **A compare-and-swap** stops two DIFFERENT events racing on one payment. The
// goal path had the first and not the second: both deliveries read PENDING,
// both mapped to SUCCESS, both wrote, and both went on to credit the pool,
// thank the member and re-derive the goal. The ledger's own uniqueness caught
// the double credit; nothing caught the double thank-you, and nothing made the
// state transition the arbiter.
//
// The contribution handler four files away has done it correctly for a while.
// Same shape, now, on this one.
//
// ── And the transition that should never have been reachable ───────────────
//
// The old guard refused anything leaving a terminal state, with an exception
// for reversing a settled payment. Correct about terminal states, silent about
// PENDING — which is not one. So `PENDING -> REVERSED` was permitted, and a
// reordered delivery could:
//
//   1. reverse a payment before the settlement it reverses arrives;
//   2. leave it REVERSED having never been SUCCESS;
//   3. refuse the real SUCCESS when it lands, because REVERSED is terminal.
//
// The payment then reads as money that came back, having never been recorded
// as money that arrived — and because it was never SUCCESS, `processedAt` was
// never stamped, so the ledger reconciler correctly leaves it alone. The member
// paid and nothing anywhere says so.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  findPaymentByGatewayRef: vi.fn(),
  updatePaymentIfStatus: vi.fn(),
  findById: vi.fn(),
  mapTransactionStatus: vi.fn(),
  syncAdditional: vi.fn(),
  postPoolCredit: vi.fn(),
  postPoolDebit: vi.fn(),
  queueNotification: vi.fn(),
}))

vi.mock('@/repositories/goal.repository', () => ({
  goalRepo: {
    findPaymentByGatewayRef: mocks.findPaymentByGatewayRef,
    updatePaymentIfStatus: mocks.updatePaymentIfStatus,
    updatePayment: vi.fn(),
    findById: mocks.findById,
  },
}))
vi.mock('@/integrations/payment', () => ({
  paymentGateway: { mapTransactionStatus: mocks.mapTransactionStatus },
}))
vi.mock('@/services/goal.service', () => ({
  syncPrimaryGoalProgress: vi.fn(),
  syncAdditionalGoalProgress: mocks.syncAdditional,
}))
vi.mock('@/services/ledger.service', () => ({
  postPoolCredit: mocks.postPoolCredit,
  postPoolDebit: mocks.postPoolDebit,
}))
vi.mock('@/services/notification.service', () => ({ queueNotification: mocks.queueNotification }))

import { processGoalPaymentWebhook } from '@/services/goal-payment.service'

const GOAL = { id: 'g-1', status: 'ACTIVE', isPrimary: false, title: 'Vehicle', targetAmount: 50000 }

function paymentAt(status: string) {
  return { id: 'gp-1', goalId: 'g-1', userId: 'u-1', amount: 250, status }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findById.mockResolvedValue({ ...GOAL })
  mocks.updatePaymentIfStatus.mockResolvedValue({ count: 1 })
  mocks.syncAdditional.mockResolvedValue(undefined)
  mocks.postPoolCredit.mockResolvedValue(undefined)
  mocks.postPoolDebit.mockResolvedValue(undefined)
  mocks.queueNotification.mockResolvedValue(undefined)
})

describe('the transition table', () => {
  const cases = [
    { from: 'PENDING', to: 'SUCCESS', allowed: true, why: 'the ordinary settlement' },
    { from: 'PENDING', to: 'FAILED', allowed: true, why: 'the bank declined it' },
    { from: 'PENDING', to: 'REVERSED', allowed: false, why: 'nothing settled, so nothing came back' },
    { from: 'SUCCESS', to: 'REVERSED', allowed: true, why: 'the bank pulled cleared money back' },
    { from: 'SUCCESS', to: 'FAILED', allowed: false, why: 'settled money cannot become a decline' },
    { from: 'FAILED', to: 'SUCCESS', allowed: true, why: 'a late settlement of a decline' },
    { from: 'REVERSED', to: 'SUCCESS', allowed: false, why: 'a replay must not resurrect reversed money' },
    { from: 'REVERSED', to: 'FAILED', allowed: false, why: 'REVERSED is the end' },
  ] as const

  it.each(cases)('$from -> $to is ${allowed} — $why', async ({ from, to, allowed }) => {
    mocks.findPaymentByGatewayRef.mockResolvedValue(paymentAt(from))
    mocks.mapTransactionStatus.mockReturnValue(to)

    await processGoalPaymentWebhook({ transactionRef: 'ref-1', status: to })

    if (allowed) {
      expect(mocks.updatePaymentIfStatus).toHaveBeenCalledWith('gp-1', from, expect.anything())
    } else {
      expect(mocks.updatePaymentIfStatus).not.toHaveBeenCalled()
    }
  })

  it('refuses a reversal that arrives before the settlement it reverses', async () => {
    // The whole finding, as one case. Applying it would leave a payment that
    // reads as money returned, having never been recorded as money received —
    // and with no processedAt, so the reconciler correctly never unwinds it.
    mocks.findPaymentByGatewayRef.mockResolvedValue(paymentAt('PENDING'))
    mocks.mapTransactionStatus.mockReturnValue('REVERSED')

    await processGoalPaymentWebhook({ transactionRef: 'ref-1', status: 'REVERSED' })

    expect(mocks.updatePaymentIfStatus).not.toHaveBeenCalled()
    expect(mocks.postPoolDebit).not.toHaveBeenCalled()
  })

  it('still settles when the real SUCCESS arrives afterwards', async () => {
    // Because the reversal was refused rather than applied, the payment is
    // still PENDING and the settlement lands normally.
    mocks.findPaymentByGatewayRef.mockResolvedValue(paymentAt('PENDING'))
    mocks.mapTransactionStatus.mockReturnValue('SUCCESS')

    await processGoalPaymentWebhook({ transactionRef: 'ref-1', status: 'SUCCESS' })

    expect(mocks.postPoolCredit).toHaveBeenCalledOnce()
  })
})

describe('two different events racing on one payment', () => {
  it('claims the transition against the status it read', async () => {
    mocks.findPaymentByGatewayRef.mockResolvedValue(paymentAt('PENDING'))
    mocks.mapTransactionStatus.mockReturnValue('SUCCESS')

    await processGoalPaymentWebhook({ transactionRef: 'ref-1', status: 'SUCCESS' })

    expect(mocks.updatePaymentIfStatus).toHaveBeenCalledWith(
      'gp-1', 'PENDING', expect.objectContaining({ status: 'SUCCESS' }),
    )
  })

  it('does nothing further when it lost the race', async () => {
    // The point of the count. Without it the loser carried on and credited the
    // pool, thanked the member and re-derived a goal already correct — the
    // ledger's uniqueness caught the credit, and nothing caught the rest.
    mocks.findPaymentByGatewayRef.mockResolvedValue(paymentAt('PENDING'))
    mocks.mapTransactionStatus.mockReturnValue('SUCCESS')
    mocks.updatePaymentIfStatus.mockResolvedValue({ count: 0 })

    await processGoalPaymentWebhook({ transactionRef: 'ref-1', status: 'SUCCESS' })

    expect(mocks.postPoolCredit).not.toHaveBeenCalled()
    expect(mocks.queueNotification).not.toHaveBeenCalled()
    expect(mocks.syncAdditional).not.toHaveBeenCalled()
  })

  it('thanks the member exactly once across two concurrent deliveries', async () => {
    // One wins the swap, one loses it.
    mocks.findPaymentByGatewayRef.mockResolvedValue(paymentAt('PENDING'))
    mocks.mapTransactionStatus.mockReturnValue('SUCCESS')
    mocks.updatePaymentIfStatus
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 })

    await Promise.all([
      processGoalPaymentWebhook({ transactionRef: 'ref-1', status: 'SUCCESS' }),
      processGoalPaymentWebhook({ transactionRef: 'ref-1', status: 'SUCCESS' }),
    ])

    expect(mocks.queueNotification).toHaveBeenCalledOnce()
  })
})

describe('unchanged behaviour', () => {
  it('ignores a reference it does not own', async () => {
    // Contribution events reach this handler too; both no-op on the other's.
    mocks.findPaymentByGatewayRef.mockResolvedValue(null)

    await processGoalPaymentWebhook({ transactionRef: 'not-a-goal-payment', status: 'SUCCESS' })

    expect(mocks.updatePaymentIfStatus).not.toHaveBeenCalled()
  })

  it('ignores a status it cannot map', async () => {
    mocks.findPaymentByGatewayRef.mockResolvedValue(paymentAt('PENDING'))
    mocks.mapTransactionStatus.mockReturnValue(null)

    await processGoalPaymentWebhook({ transactionRef: 'ref-1', status: 'WHO_KNOWS' })

    expect(mocks.updatePaymentIfStatus).not.toHaveBeenCalled()
  })

  it('is a no-op on a redelivery of the status it already holds', async () => {
    mocks.findPaymentByGatewayRef.mockResolvedValue(paymentAt('SUCCESS'))
    mocks.mapTransactionStatus.mockReturnValue('SUCCESS')

    await processGoalPaymentWebhook({ transactionRef: 'ref-1', status: 'SUCCESS' })

    expect(mocks.updatePaymentIfStatus).not.toHaveBeenCalled()
  })
})
