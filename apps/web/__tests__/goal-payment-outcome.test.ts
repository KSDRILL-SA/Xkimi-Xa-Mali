import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The same two defects as the manual contribution path, in its sibling.
 *
 * `payToGoal` collapsed the gateway's three answers onto two — the fifth copy
 * of §4.6 after debit-run, transaction-retry-failed, mandate-delay-handler and
 * `submitManualPayment`. A declined goal payment was written PENDING, so the
 * member was told their contribution to the fund was on its way, the goal's
 * progress waited on a settlement that was never coming, and nothing retried
 * it.
 *
 * And its idempotency key ended in `randomUUID()`, so it was unique on every
 * request and the unique index on the column could never fire — a double tap on
 * "contribute to this goal" took the money twice. Fixed in the contribution
 * path in #309; this path had it too and was not looked at.
 */

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findActiveByUser: vi.fn(),
  findByKey: vi.fn(),
  createPayment: vi.fn(),
  updatePayment: vi.fn(),
  submitOnceOffDebit: vi.fn(),
  logWarn: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: {} }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: mocks.logWarn, error: vi.fn() },
}))
vi.mock('@/integrations/payment', () => ({
  paymentGateway: { submitOnceOffDebit: mocks.submitOnceOffDebit },
}))
vi.mock('@/repositories/goal.repository', () => ({
  goalRepo: {
    findById: mocks.findById,
    findPaymentByIdempotencyKey: mocks.findByKey,
    createPayment: mocks.createPayment,
    updatePayment: mocks.updatePayment,
  },
}))
vi.mock('@/repositories/mandate.repository', () => ({
  mandateRepo: { findActiveByUser: mocks.findActiveByUser },
}))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/services/ledger.service', () => ({
  postPoolCredit: vi.fn().mockResolvedValue(undefined),
  postPoolDebit: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/services/notification.service', () => ({
  queueNotification: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/services/goal.service', () => ({
  syncPrimaryGoalProgress: vi.fn().mockResolvedValue(undefined),
  syncAdditionalGoalProgress: vi.fn().mockResolvedValue(undefined),
}))

import { payToGoal } from '@/services/goal-payment.service'

const TOKEN = '11111111-2222-4333-8444-555555555555'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findById.mockResolvedValue({
    id: 'goal-1', status: 'ACTIVE', isPrimary: false, title: 'Bakkie', targetAmount: 100000,
  })
  mocks.findActiveByUser.mockResolvedValue({ netcashMandateId: 'NC-1' })
  mocks.findByKey.mockResolvedValue(null)
  mocks.createPayment.mockImplementation(async (d: { status: string }) => ({ id: 'pay-1', ...d }))
  mocks.updatePayment.mockImplementation(async (id: string, d: object) => ({ id, ...d }))
})

const pay = (token?: string) => payToGoal('goal-1', 'user-1', 'user-1', [], 500, undefined, token)

describe('what the bank actually said', () => {
  it('records a decline as FAILED, not as PENDING', async () => {
    mocks.submitOnceOffDebit.mockResolvedValue({ status: 'FAILED', reason: 'insufficient funds' })

    const result = await pay(TOKEN)

    // Written by the update now, not the insert: the row is claimed as PENDING
    // before the gateway is touched, so the claim can never carry the outcome.
    expect(mocks.updatePayment.mock.calls[0][1].status).toBe('FAILED')
    expect(result.status).toBe('FAILED')
  })

  it('leaves a genuinely pending collection as PENDING', async () => {
    mocks.submitOnceOffDebit.mockResolvedValue({ status: 'PENDING' })

    expect((await pay(TOKEN)).status).toBe('PENDING')
  })

  it('records a settled collection as SUCCESS', async () => {
    mocks.submitOnceOffDebit.mockResolvedValue({ status: 'SUCCESS', transactionRef: 'r1' })

    expect((await pay(TOKEN)).status).toBe('SUCCESS')
  })

  it('does not stamp processedAt on a decline', async () => {
    mocks.submitOnceOffDebit.mockResolvedValue({ status: 'FAILED' })

    await pay(TOKEN)

    expect(mocks.updatePayment.mock.calls[0][1].processedAt).toBeNull()
  })

  it('uses the shared mapper rather than a fifth copy of the rule', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(resolve(__dirname, '../services/goal-payment.service.ts'), 'utf8')

    expect(source).toContain("from '@/lib/transaction-status'")
    expect(source).not.toMatch(/status === 'SUCCESS' \? 'SUCCESS' : 'PENDING'/)
  })
})

describe('the same payment submitted twice', () => {
  it('does not debit again when the token has already been used', async () => {
    mocks.findByKey.mockResolvedValue({ id: 'pay-first', status: 'SUCCESS' })

    const result = await pay(TOKEN)

    expect(mocks.submitOnceOffDebit).not.toHaveBeenCalled()
    expect(mocks.createPayment).not.toHaveBeenCalled()
    expect(result.payment).toMatchObject({ id: 'pay-first' })
  })

  it('checks before calling the gateway, not after', async () => {
    mocks.submitOnceOffDebit.mockResolvedValue({ status: 'SUCCESS' })

    await pay(TOKEN)

    expect(mocks.findByKey.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.submitOnceOffDebit.mock.invocationCallOrder[0])
  })

  it('namespaces the token by goal and by member', async () => {
    mocks.submitOnceOffDebit.mockResolvedValue({ status: 'SUCCESS' })

    await pay(TOKEN)

    const key = mocks.findByKey.mock.calls[0][0]
    expect(key).toContain('goal-1')
    expect(key).toContain('user-1')
    expect(key).toContain(TOKEN)
  })

  it('lets a second, deliberate gift through on a fresh token', async () => {
    // A member may legitimately give to one goal more than once.
    mocks.submitOnceOffDebit.mockResolvedValue({ status: 'SUCCESS' })

    await pay(TOKEN)
    await pay('99999999-2222-4333-8444-555555555555')

    expect(mocks.submitOnceOffDebit).toHaveBeenCalledTimes(2)
  })

  it('still pays, but says so, when a caller sends no token', async () => {
    mocks.submitOnceOffDebit.mockResolvedValue({ status: 'SUCCESS' })

    await pay()

    expect(mocks.logWarn).toHaveBeenCalledWith(
      'Goal payment submitted without an idempotency token',
      expect.anything(),
    )
  })
})
