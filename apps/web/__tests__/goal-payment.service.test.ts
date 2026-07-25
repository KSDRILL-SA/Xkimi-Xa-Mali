import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

vi.mock('@/repositories/goal.repository', () => ({
  goalRepo: {
    findById: vi.fn(),
    createPayment: vi.fn(),
    incrementAmount: vi.fn(),
    update: vi.fn(),
    findPaymentByGatewayRef: vi.fn(),
    updatePayment: vi.fn(),
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
vi.mock('@/services/ledger.service', () => ({ postPoolCredit: vi.fn().mockResolvedValue(true) }))
vi.mock('@/services/notification.service', () => ({ queueNotification: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/goal.service', () => ({
  syncPrimaryGoalProgress: vi.fn().mockResolvedValue(undefined),
  emitGoalAchieved: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

import { goalRepo } from '@/repositories/goal.repository'
import { mandateRepo } from '@/repositories/mandate.repository'
import { paymentGateway } from '@/integrations/payment'
import { postPoolCredit } from '@/services/ledger.service'
import { syncPrimaryGoalProgress } from '@/services/goal.service'
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
  mock(goalRepo.incrementAmount).mockResolvedValue({ currentAmount: 600, targetAmount: 5000, status: 'ACTIVE' } as never)
})

describe('payToGoal', () => {
  it('debits with the fee buffer and credits an additional goal + the pool on success', async () => {
    mock(goalRepo.findById).mockResolvedValue(ADDITIONAL as never)

    const result = await payToGoal('goal-1', 'u1', 'u1', ['MEMBER'], 500, '127.0.0.1')

    expect(result.status).toBe('SUCCESS')
    expect(paymentGateway.submitOnceOffDebit).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 510, mandateId: 'nc-1' }), // 500 + fee buffer
    )
    expect(goalRepo.incrementAmount).toHaveBeenCalledWith('goal-1', 500)
    expect(postPoolCredit).toHaveBeenCalledWith(expect.objectContaining({ refType: 'GOAL_PAYMENT', amount: 500 }))
    expect(syncPrimaryGoalProgress).not.toHaveBeenCalled()
  })

  it('re-derives the primary fund instead of incrementing when paying the primary', async () => {
    mock(goalRepo.findById).mockResolvedValue(PRIMARY as never)

    await payToGoal('primary-1', 'u1', 'u1', ['MEMBER'], 200, '127.0.0.1')

    expect(syncPrimaryGoalProgress).toHaveBeenCalledOnce()
    expect(goalRepo.incrementAmount).not.toHaveBeenCalled()
  })

  it('marks an additional goal ACHIEVED once it reaches target', async () => {
    mock(goalRepo.findById).mockResolvedValue(ADDITIONAL as never)
    mock(goalRepo.incrementAmount).mockResolvedValue({ currentAmount: 5000, targetAmount: 5000, status: 'ACTIVE' } as never)

    await payToGoal('goal-1', 'u1', 'u1', ['MEMBER'], 500, '127.0.0.1')

    expect(goalRepo.update).toHaveBeenCalledWith('goal-1', { status: 'ACHIEVED' })
  })

  it('records but does not count a PENDING gateway result', async () => {
    mock(goalRepo.findById).mockResolvedValue(ADDITIONAL as never)
    mock(paymentGateway.submitOnceOffDebit).mockResolvedValue({ status: 'PENDING' } as never)

    const result = await payToGoal('goal-1', 'u1', 'u1', ['MEMBER'], 500, '127.0.0.1')

    expect(result.status).toBe('PENDING')
    expect(goalRepo.createPayment).toHaveBeenCalledWith(expect.objectContaining({ status: 'PENDING' }))
    expect(goalRepo.incrementAmount).not.toHaveBeenCalled()
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

    expect(goalRepo.updatePayment).toHaveBeenCalledWith('gp-1', expect.objectContaining({ status: 'SUCCESS' }))
    expect(goalRepo.incrementAmount).toHaveBeenCalledWith('goal-1', 500)
    expect(postPoolCredit).toHaveBeenCalledWith(expect.objectContaining({ refType: 'GOAL_PAYMENT', refId: 'gp-1', amount: 500 }))
  })

  it('re-derives the primary fund when the settled payment targets it', async () => {
    mock(goalRepo.findPaymentByGatewayRef).mockResolvedValue({ ...PENDING_PAYMENT, goalId: 'primary-1' } as never)
    mock(goalRepo.findById).mockResolvedValue(PRIMARY as never)

    await processGoalPaymentWebhook({ transactionRef: 'tx-ref-1', status: 'SUCCESS' })

    expect(syncPrimaryGoalProgress).toHaveBeenCalledOnce()
    expect(goalRepo.incrementAmount).not.toHaveBeenCalled()
  })

  it('ignores a reference that belongs to a contribution, not a goal payment', async () => {
    mock(goalRepo.findPaymentByGatewayRef).mockResolvedValue(null)

    await processGoalPaymentWebhook({ transactionRef: 'tx-ref-other', status: 'SUCCESS' })

    expect(goalRepo.updatePayment).not.toHaveBeenCalled()
    expect(postPoolCredit).not.toHaveBeenCalled()
  })

  it('is redelivery-safe — an already-settled payment is never credited twice', async () => {
    mock(goalRepo.findPaymentByGatewayRef).mockResolvedValue({ ...PENDING_PAYMENT, status: 'SUCCESS' } as never)

    await processGoalPaymentWebhook({ transactionRef: 'tx-ref-1', status: 'SUCCESS' })

    expect(goalRepo.updatePayment).not.toHaveBeenCalled()
    expect(goalRepo.incrementAmount).not.toHaveBeenCalled()
    expect(postPoolCredit).not.toHaveBeenCalled()
  })

  it('records a failure without moving any money', async () => {
    mock(goalRepo.findPaymentByGatewayRef).mockResolvedValue(PENDING_PAYMENT as never)

    await processGoalPaymentWebhook({ transactionRef: 'tx-ref-1', status: 'FAILED' })

    expect(goalRepo.updatePayment).toHaveBeenCalledWith('gp-1', expect.objectContaining({ status: 'FAILED' }))
    expect(goalRepo.incrementAmount).not.toHaveBeenCalled()
    expect(postPoolCredit).not.toHaveBeenCalled()
  })

  it('ignores an unmappable gateway status', async () => {
    mock(goalRepo.findPaymentByGatewayRef).mockResolvedValue(PENDING_PAYMENT as never)

    await processGoalPaymentWebhook({ transactionRef: 'tx-ref-1', status: 'SOMETHING_ELSE' })

    expect(goalRepo.updatePayment).not.toHaveBeenCalled()
  })
})
