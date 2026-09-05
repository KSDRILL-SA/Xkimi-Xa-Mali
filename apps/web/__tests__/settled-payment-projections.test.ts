import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// What `SUCCESS` promises, and what it does not.
//
// The contract, now written down in `applySettledPayment`:
//
//     SUCCESS means the payment is recorded as settled. Nothing after that
//     point may unwind it — the money has already moved, and a hiccup in our
//     bookkeeping is not a reason to tell a member their payment failed.
//     Everything after it is an asynchronous projection, guaranteed by
//     reconciliation.
//
// Three projections follow a settlement: the goal total re-derives, the pool
// ledger is credited, and the member is thanked. Two of them were `.catch`ed
// on that reasoning. `resyncGoal` was not — so a throw there propagated out of
// the function and skipped the ledger credit that would otherwise have been
// attempted, turning one stale figure into two.
//
// The step that matters most is the one furthest down the list, which is
// exactly the ordering that makes this easy to miss.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  syncPrimary: vi.fn(),
  syncAdditional: vi.fn(),
  postPoolCredit: vi.fn(),
  postPoolDebit: vi.fn(),
  queueNotification: vi.fn(),
  updatePayment: vi.fn(),
  findPaymentByGatewayRef: vi.fn(),
  findGoalById: vi.fn(),
  mapTransactionStatus: vi.fn(),
}))

vi.mock('@/services/goal.service', () => ({
  syncPrimaryGoalProgress: mocks.syncPrimary,
  syncAdditionalGoalProgress: mocks.syncAdditional,
}))
vi.mock('@/services/ledger.service', () => ({
  postPoolCredit: mocks.postPoolCredit,
  postPoolDebit: mocks.postPoolDebit,
}))
vi.mock('@/services/notification.service', () => ({ queueNotification: mocks.queueNotification }))
vi.mock('@/repositories/goal.repository', () => ({
  goalRepo: {
    updatePayment: mocks.updatePayment,
    findPaymentByGatewayRef: mocks.findPaymentByGatewayRef,
    findById: mocks.findGoalById,
  },
}))
vi.mock('@/integrations/payment', () => ({
  paymentGateway: { mapTransactionStatus: mocks.mapTransactionStatus },
}))

import { processGoalPaymentWebhook } from '@/services/goal-payment.service'

const PAYMENT = { id: 'gp-1', goalId: 'g-1', userId: 'u-1', amount: 250, status: 'PENDING' }
const GOAL = { id: 'g-1', status: 'ACTIVE', isPrimary: false, title: 'Vehicle', targetAmount: 50000 }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findPaymentByGatewayRef.mockResolvedValue({ ...PAYMENT })
  mocks.findGoalById.mockResolvedValue({ ...GOAL })
  mocks.mapTransactionStatus.mockReturnValue('SUCCESS')
  mocks.syncAdditional.mockResolvedValue(undefined)
  mocks.postPoolCredit.mockResolvedValue(undefined)
  mocks.queueNotification.mockResolvedValue(undefined)
  mocks.updatePayment.mockResolvedValue(undefined)
})

describe('a settled payment credits the pool', () => {
  it('records the settlement, re-derives the goal and credits the ledger', async () => {
    await processGoalPaymentWebhook({ transactionRef: 'ref-1', status: 'SUCCESS' })

    expect(mocks.updatePayment).toHaveBeenCalledWith('gp-1', expect.objectContaining({ status: 'SUCCESS' }))
    expect(mocks.syncAdditional).toHaveBeenCalledWith('g-1')
    expect(mocks.postPoolCredit).toHaveBeenCalledWith(
      expect.objectContaining({ refType: 'GOAL_PAYMENT', refId: 'gp-1', amount: 250 }),
    )
  })

  it('still credits the ledger when the goal re-sync throws', async () => {
    // The defect. A stale goal figure is recoverable — the next sync fixes it.
    // A missing ledger entry left the fund understating what it holds until the
    // 05:00 reconciler, and only because that reconciler exists at all.
    mocks.syncAdditional.mockRejectedValue(new Error('goal sync exploded'))

    await expect(
      processGoalPaymentWebhook({ transactionRef: 'ref-1', status: 'SUCCESS' }),
    ).resolves.toBeUndefined()

    expect(mocks.postPoolCredit).toHaveBeenCalledOnce()
  })

  it('still thanks the member when the ledger credit fails', async () => {
    // Already true, and pinned so the ordering stays independent.
    mocks.postPoolCredit.mockRejectedValue(new Error('ledger unavailable'))

    await processGoalPaymentWebhook({ transactionRef: 'ref-1', status: 'SUCCESS' })

    expect(mocks.queueNotification).toHaveBeenCalledOnce()
  })

  it('does not fail the settlement when every projection fails', async () => {
    // The whole point of the contract: the money moved, so the payment is
    // settled, whatever our bookkeeping manages afterwards.
    mocks.syncAdditional.mockRejectedValue(new Error('a'))
    mocks.postPoolCredit.mockRejectedValue(new Error('b'))
    mocks.queueNotification.mockRejectedValue(new Error('c'))

    await expect(
      processGoalPaymentWebhook({ transactionRef: 'ref-1', status: 'SUCCESS' }),
    ).resolves.toBeUndefined()

    expect(mocks.updatePayment).toHaveBeenCalledWith('gp-1', expect.objectContaining({ status: 'SUCCESS' }))
  })
})

describe('a reversed payment debits the pool', () => {
  beforeEach(() => {
    mocks.findPaymentByGatewayRef.mockResolvedValue({ ...PAYMENT, status: 'SUCCESS' })
    mocks.mapTransactionStatus.mockReturnValue('REVERSED')
    mocks.postPoolDebit.mockResolvedValue(undefined)
  })

  it('still debits the ledger when the goal re-sync throws', async () => {
    // The direction that matters most: without the debit the fund goes on
    // showing money it no longer holds.
    mocks.syncAdditional.mockRejectedValue(new Error('goal sync exploded'))

    await processGoalPaymentWebhook({ transactionRef: 'ref-1', status: 'REVERSED' })

    expect(mocks.postPoolDebit).toHaveBeenCalledWith(
      expect.objectContaining({ refType: 'GOAL_PAYMENT', refId: 'gp-1' }),
    )
  })
})

describe('the contract is written down where it applies', () => {
  const read = async (rel: string) => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    return readFileSync(resolve(__dirname, rel), 'utf8')
  }

  it('says what SUCCESS means and what follows it', async () => {
    // Three findings across two audits were the same missing sentence. Stating
    // it costs nothing and is the only thing that makes the `.catch`es read as
    // a decision rather than as sloppiness.
    const src = await read('../services/goal-payment.service.ts')

    const flat = src.split(/\s+/).join(' ').replace(/ \* /g, ' ')

    expect(flat).toMatch(/asynchronous projection/i)
    expect(flat).toMatch(/guaranteed by reconciliation/i)
  })

  it('marks every read of a materialised goal total as one', async () => {
    // `currentAmount` is a cache of a derived figure. Both readers now say so,
    // and say why each is or is not allowed to rely on it — a suggestion the
    // member edits, versus a collection that decides money.
    const src = await read('../services/goal-plan.service.ts')

    expect(src.match(/materialised figure/g) ?? []).toHaveLength(2)
  })
})
