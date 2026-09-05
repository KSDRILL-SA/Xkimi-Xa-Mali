import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

vi.mock('@/repositories/goal.repository', () => ({
  goalRepo: {
    findById: vi.fn(),
    findPaymentByIdempotencyKey: vi.fn().mockResolvedValue(null),
    createPayment: vi.fn(),
    update: vi.fn(),
    findPaymentByGatewayRef: vi.fn(),
    updatePayment: vi.fn(),
    // The webhook path now claims the transition against the status it read,
    // so two different events racing on one payment cannot both apply.
    updatePaymentIfStatus: vi.fn(),
  },
}))
vi.mock('@/repositories/mandate.repository', () => ({ mandateRepo: { findActiveByUser: vi.fn() } }))
vi.mock('@/integrations/payment', () => ({
  paymentGateway: {
    submitOnceOffDebit: vi.fn(),
    // Mirrors the Netcash adapter: anything unrecognised maps to null.
    mapTransactionStatus: (raw: string) =>
      (['SUCCESS', 'FAILED', 'REVERSED'].includes(raw) ? raw : null),
  },
}))
vi.mock('@/lib/group-account', () => ({ debitAmountWithFee: (n: number) => n + 10 }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/ledger.service', () => ({
  postPoolCredit: vi.fn().mockResolvedValue(true),
  postPoolDebit: vi.fn().mockResolvedValue(true),
}))
vi.mock('@/services/notification.service', () => ({ queueNotification: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/goal.service', () => ({
  syncPrimaryGoalProgress: vi.fn().mockResolvedValue(undefined),
  syncAdditionalGoalProgress: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@xxm/observability', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { goalRepo } from '@/repositories/goal.repository'
import { mandateRepo } from '@/repositories/mandate.repository'
import { paymentGateway } from '@/integrations/payment'
import { postPoolCredit, postPoolDebit } from '@/services/ledger.service'
import { syncPrimaryGoalProgress, syncAdditionalGoalProgress } from '@/services/goal.service'
import { payToGoal, processGoalPaymentWebhook } from '@/services/goal-payment.service'
import { GoalConflictError, GoalNotFoundError, MandateConflictError, ForbiddenError } from '@/lib/errors'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>

const ADDITIONAL = { id: 'goal-1', status: 'ACTIVE', isPrimary: false, title: 'Braai Fund', targetAmount: 5000 }
const PRIMARY = { ...ADDITIONAL, id: 'primary-1', isPrimary: true, title: '2026 Fund' }

beforeEach(() => {
  vi.clearAllMocks()
  mock(mandateRepo.findActiveByUser).mockResolvedValue({ netcashMandateId: 'nc-1', amount: 100, debitDay: 25 } as never)
  mock(paymentGateway.submitOnceOffDebit).mockResolvedValue({ status: 'SUCCESS', transactionRef: 'tx-ref-1' } as never)
  mock(goalRepo.createPayment).mockResolvedValue({ id: 'gp-1' } as never)
  // Won the compare-and-swap, which is the ordinary case. A count of 0 means
  // a parallel delivery got there first.
  mock(goalRepo.updatePaymentIfStatus).mockResolvedValue({ count: 1 } as never)
})

describe('payToGoal', () => {
  it('debits with the fee buffer and credits an additional goal + the pool on success', async () => {
    mock(goalRepo.findById).mockResolvedValue(ADDITIONAL as never)

    const result = await payToGoal('goal-1', 'u1', 'u1', ['MEMBER'], 500, '127.0.0.1')

    expect(result.status).toBe('SUCCESS')
    expect(paymentGateway.submitOnceOffDebit).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 510, mandateId: 'nc-1' }), // 500 + fee buffer
    )
    expect(syncAdditionalGoalProgress).toHaveBeenCalledWith('goal-1')
    expect(postPoolCredit).toHaveBeenCalledWith(expect.objectContaining({ refType: 'GOAL_PAYMENT', amount: 500 }))
    expect(syncPrimaryGoalProgress).not.toHaveBeenCalled()
  })

  it('re-derives the primary fund instead of incrementing when paying the primary', async () => {
    mock(goalRepo.findById).mockResolvedValue(PRIMARY as never)

    await payToGoal('primary-1', 'u1', 'u1', ['MEMBER'], 200, '127.0.0.1')

    expect(syncPrimaryGoalProgress).toHaveBeenCalledOnce()
    expect(syncAdditionalGoalProgress).not.toHaveBeenCalled()
  })

  it('never writes the goal total directly — the sync owns that figure', async () => {
    // Both funds derive their total from the money behind them. A payment path
    // that wrote currentAmount itself would drift the moment one was reversed.
    mock(goalRepo.findById).mockResolvedValue(ADDITIONAL as never)

    await payToGoal('goal-1', 'u1', 'u1', ['MEMBER'], 500, '127.0.0.1')

    expect(goalRepo.update).not.toHaveBeenCalled()
  })

  it('records but does not count a PENDING gateway result', async () => {
    mock(goalRepo.findById).mockResolvedValue(ADDITIONAL as never)
    mock(paymentGateway.submitOnceOffDebit).mockResolvedValue({ status: 'PENDING' } as never)

    const result = await payToGoal('goal-1', 'u1', 'u1', ['MEMBER'], 500, '127.0.0.1')

    expect(result.status).toBe('PENDING')
    expect(goalRepo.createPayment).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING' }))
    expect(syncAdditionalGoalProgress).not.toHaveBeenCalled()
    expect(postPoolCredit).not.toHaveBeenCalled()
  })

  it('rejects an amount below the minimum before doing anything', async () => {
    await expect(payToGoal('goal-1', 'u1', 'u1', ['MEMBER'], 5, '127.0.0.1')).rejects.toThrow(GoalConflictError)
    expect(goalRepo.findById).not.toHaveBeenCalled()
  })

  it('throws when the goal does not exist', async () => {
    mock(goalRepo.findById).mockResolvedValue(null)
    await expect(payToGoal('missing', 'u1', 'u1', ['MEMBER'], 500, '127.0.0.1')).rejects.toThrow(GoalNotFoundError)
  })

  it('refuses a non-active goal', async () => {
    mock(goalRepo.findById).mockResolvedValue({ ...ADDITIONAL, status: 'DRAFT' } as never)
    await expect(payToGoal('goal-1', 'u1', 'u1', ['MEMBER'], 500, '127.0.0.1')).rejects.toThrow(GoalConflictError)
    expect(paymentGateway.submitOnceOffDebit).not.toHaveBeenCalled()
  })

  it('requires an active mandate', async () => {
    mock(goalRepo.findById).mockResolvedValue(ADDITIONAL as never)
    mock(mandateRepo.findActiveByUser).mockResolvedValue(null as never)
    await expect(payToGoal('goal-1', 'u1', 'u1', ['MEMBER'], 500, '127.0.0.1')).rejects.toThrow(MandateConflictError)
    expect(paymentGateway.submitOnceOffDebit).not.toHaveBeenCalled()
  })

  it('refuses paying on behalf of another member', async () => {
    await expect(payToGoal('goal-1', 'other-user', 'u1', ['MEMBER'], 500, '127.0.0.1')).rejects.toThrow(ForbiddenError)
    expect(goalRepo.findById).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Webhook settlement — a PENDING payment is only money once Netcash confirms it.
// ---------------------------------------------------------------------------

describe('processGoalPaymentWebhook', () => {
  const PENDING_PAYMENT = { id: 'gp-1', goalId: 'goal-1', userId: 'u1', amount: 500, status: 'PENDING' }

  it('settles a pending payment: credits the goal, the pool and thanks the member', async () => {
    mock(goalRepo.findPaymentByGatewayRef).mockResolvedValue(PENDING_PAYMENT as never)
    mock(goalRepo.findById).mockResolvedValue(ADDITIONAL as never)

    await processGoalPaymentWebhook({ transactionRef: 'tx-ref-1', status: 'SUCCESS' })

    expect(goalRepo.updatePaymentIfStatus).toHaveBeenCalledWith('gp-1', 'PENDING', expect.objectContaining({ status: 'SUCCESS' }))
    expect(syncAdditionalGoalProgress).toHaveBeenCalledWith('goal-1')
    expect(postPoolCredit).toHaveBeenCalledWith(expect.objectContaining({ refType: 'GOAL_PAYMENT', refId: 'gp-1', amount: 500 }))
  })

  it('re-derives the primary fund when the settled payment targets it', async () => {
    mock(goalRepo.findPaymentByGatewayRef).mockResolvedValue({ ...PENDING_PAYMENT, goalId: 'primary-1' } as never)
    mock(goalRepo.findById).mockResolvedValue(PRIMARY as never)

    await processGoalPaymentWebhook({ transactionRef: 'tx-ref-1', status: 'SUCCESS' })

    expect(syncPrimaryGoalProgress).toHaveBeenCalledOnce()
    expect(syncAdditionalGoalProgress).not.toHaveBeenCalled()
  })

  it('ignores a reference that belongs to a contribution, not a goal payment', async () => {
    mock(goalRepo.findPaymentByGatewayRef).mockResolvedValue(null)

    await processGoalPaymentWebhook({ transactionRef: 'tx-ref-other', status: 'SUCCESS' })

    expect(goalRepo.updatePaymentIfStatus).not.toHaveBeenCalled()
    expect(postPoolCredit).not.toHaveBeenCalled()
  })

  it('is redelivery-safe — an already-settled payment is never credited twice', async () => {
    mock(goalRepo.findPaymentByGatewayRef).mockResolvedValue({ ...PENDING_PAYMENT, status: 'SUCCESS' } as never)

    await processGoalPaymentWebhook({ transactionRef: 'tx-ref-1', status: 'SUCCESS' })

    expect(goalRepo.updatePaymentIfStatus).not.toHaveBeenCalled()
    expect(syncAdditionalGoalProgress).not.toHaveBeenCalled()
    expect(postPoolCredit).not.toHaveBeenCalled()
  })

  it('records a failure without moving any money', async () => {
    mock(goalRepo.findPaymentByGatewayRef).mockResolvedValue(PENDING_PAYMENT as never)

    await processGoalPaymentWebhook({ transactionRef: 'tx-ref-1', status: 'FAILED' })

    expect(goalRepo.updatePaymentIfStatus).toHaveBeenCalledWith('gp-1', 'PENDING', expect.objectContaining({ status: 'FAILED' }))
    expect(syncAdditionalGoalProgress).not.toHaveBeenCalled()
    expect(postPoolCredit).not.toHaveBeenCalled()
  })

  it('ignores an unmappable gateway status', async () => {
    mock(goalRepo.findPaymentByGatewayRef).mockResolvedValue(PENDING_PAYMENT as never)

    await processGoalPaymentWebhook({ transactionRef: 'tx-ref-1', status: 'SOMETHING_ELSE' })

    expect(goalRepo.updatePaymentIfStatus).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Reversal — the bank can pull settled money back, and the fund must follow.
// ---------------------------------------------------------------------------

describe('processGoalPaymentWebhook — reversal of a settled payment', () => {
  const SETTLED = {
    id: 'gp-1', goalId: 'goal-1', userId: 'u1', amount: 500,
    status: 'SUCCESS', processedAt: new Date('2026-07-01'),
  }
  /** Collected but never confirmed, so nothing was ever applied to undo. */
  const NEVER_SETTLED = { id: 'gp-1', goalId: 'goal-1', userId: 'u1', amount: 500, status: 'PENDING', processedAt: null }

  it('unwinds an additional goal: re-derives the total and debits the pool', async () => {
    mock(goalRepo.findPaymentByGatewayRef).mockResolvedValue(SETTLED as never)
    mock(goalRepo.findById).mockResolvedValue(ADDITIONAL as never)

    await processGoalPaymentWebhook({ transactionRef: 'tx-ref-1', status: 'REVERSED' })

    expect(goalRepo.updatePaymentIfStatus).toHaveBeenCalledWith('gp-1', 'SUCCESS', expect.objectContaining({ status: 'REVERSED' }))
    expect(syncAdditionalGoalProgress).toHaveBeenCalledWith('goal-1')
    expect(postPoolDebit).toHaveBeenCalledWith(
      expect.objectContaining({ refType: 'GOAL_PAYMENT', refId: 'gp-1', amount: 500 }),
    )
    expect(postPoolCredit).not.toHaveBeenCalled()
  })

  it('unwinds the primary fund the same way', async () => {
    mock(goalRepo.findPaymentByGatewayRef).mockResolvedValue({ ...SETTLED, goalId: 'primary-1' } as never)
    mock(goalRepo.findById).mockResolvedValue(PRIMARY as never)

    await processGoalPaymentWebhook({ transactionRef: 'tx-ref-1', status: 'REVERSED' })

    expect(syncPrimaryGoalProgress).toHaveBeenCalledOnce()
    expect(postPoolDebit).toHaveBeenCalledWith(expect.objectContaining({ refId: 'gp-1', amount: 500 }))
  })

  it('preserves processedAt so the reconciler can tell it once cleared', async () => {
    mock(goalRepo.findPaymentByGatewayRef).mockResolvedValue(SETTLED as never)
    mock(goalRepo.findById).mockResolvedValue(ADDITIONAL as never)

    await processGoalPaymentWebhook({ transactionRef: 'tx-ref-1', status: 'REVERSED' })

    const [, , data] = mock(goalRepo.updatePaymentIfStatus).mock.calls[0] as [string, string, Record<string, unknown>]
    expect(data).not.toHaveProperty('processedAt')
  })

  it('is redelivery-safe — a repeated reversal does nothing', async () => {
    mock(goalRepo.findPaymentByGatewayRef).mockResolvedValue({ ...SETTLED, status: 'REVERSED' } as never)

    await processGoalPaymentWebhook({ transactionRef: 'tx-ref-1', status: 'REVERSED' })

    expect(goalRepo.updatePaymentIfStatus).not.toHaveBeenCalled()
    expect(postPoolDebit).not.toHaveBeenCalled()
  })

  it('never resurrects reversed money with a late SUCCESS', async () => {
    mock(goalRepo.findPaymentByGatewayRef).mockResolvedValue({ ...SETTLED, status: 'REVERSED' } as never)

    await processGoalPaymentWebhook({ transactionRef: 'tx-ref-1', status: 'SUCCESS' })

    expect(goalRepo.updatePaymentIfStatus).not.toHaveBeenCalled()
    expect(postPoolCredit).not.toHaveBeenCalled()
    expect(syncAdditionalGoalProgress).not.toHaveBeenCalled()
  })

  it('refuses to reverse a payment that never settled, rather than recording it', async () => {
    // This used to write REVERSED and then correctly decline to debit, because
    // there was no credit to undo. Declining the debit was right; writing the
    // status was not.
    //
    // It left a payment reading as money that came back, having never been
    // recorded as money that arrived — and with `processedAt` still null, so
    // the ledger reconciler rightly never unwinds it. Worse, REVERSED is
    // terminal, so the real SUCCESS arriving a moment later was refused. The
    // member paid, and nothing anywhere said so.
    //
    // A reversal before settlement is now refused outright and logged. The
    // gateway redelivers, and by then the settlement has usually landed.
    mock(goalRepo.findPaymentByGatewayRef).mockResolvedValue(NEVER_SETTLED as never)

    await processGoalPaymentWebhook({ transactionRef: 'tx-ref-1', status: 'REVERSED' })

    expect(goalRepo.updatePaymentIfStatus).not.toHaveBeenCalled()
    expect(postPoolDebit).not.toHaveBeenCalled()
    expect(syncAdditionalGoalProgress).not.toHaveBeenCalled()
  })
})
