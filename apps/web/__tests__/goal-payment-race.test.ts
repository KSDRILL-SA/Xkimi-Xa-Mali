import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Two requests, one intent, fired together.
 *
 * `payToGoal` looked the key up and, finding nothing, went to the gateway. That
 * protects a member who submits again after the first request *finished*. It
 * cannot protect a double tap, where both requests read nothing before either
 * writes — so both charged, and only the second collided on the unique index
 * afterwards. The member was debited twice at Netcash and left with one payment
 * row and a 500.
 *
 * Found by firing two real requests at the running app: statuses [500, 201],
 * with the goal moving once. The single row is why it looked survivable; the
 * two gateway calls are the actual damage.
 */

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findByKey: vi.fn(),
  createPayment: vi.fn(),
  updatePayment: vi.fn(),
  mandate: vi.fn(),
  submit: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: {} }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@xxm/observability', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/authorization', () => ({ assertCanAccess: vi.fn() }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: vi.fn() }))
// These are chained with `.catch(...)` at the call site, so a bare vi.fn()
// returning undefined throws before the assertion ever runs.
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
vi.mock('@/integrations/payment', () => ({
  paymentGateway: { submitOnceOffDebit: mocks.submit },
}))
vi.mock('@/repositories/mandate.repository', () => ({
  mandateRepo: { findActiveByUser: mocks.mandate },
}))
vi.mock('@/repositories/goal.repository', () => ({
  goalRepo: {
    findById: mocks.findById,
    findPaymentByIdempotencyKey: mocks.findByKey,
    createPayment: mocks.createPayment,
    updatePayment: mocks.updatePayment,
    sumSuccessfulPayments: vi.fn(),
  },
}))

import { payToGoal } from '@/services/goal-payment.service'

/** What Prisma raises when a unique index refuses a second row. */
function uniqueViolation() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findById.mockResolvedValue({ id: 'g1', status: 'ACTIVE', isPrimary: false, title: 'E2E Fund', targetAmount: 5000 })
  mocks.mandate.mockResolvedValue({ netcashMandateId: 'NC-1' })
  mocks.submit.mockResolvedValue({ status: 'SUCCESS', transactionRef: 'REF-1' })
  mocks.updatePayment.mockImplementation((id: string, d: object) => Promise.resolve({ id, amount: 25, ...d }))
})

describe('a double tap on the same intent', () => {
  it('reaches the gateway exactly once', async () => {
    // Both requests get past the lookup — that is what concurrency means here.
    // The loser then looks again after colliding, and by that point the
    // winner's row is there, which is what lets it answer "duplicate".
    mocks.findByKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'pay-1', status: 'SUCCESS', amount: 25 })

    // The database decides: the first insert wins, the second is refused.
    let inserted = false
    mocks.createPayment.mockImplementation(() => {
      if (inserted) return Promise.reject(uniqueViolation())
      inserted = true
      return Promise.resolve({ id: 'pay-1', amount: 25, status: 'PENDING' })
    })

    const [a, b] = await Promise.allSettled([
      payToGoal('g1', 'u1', 'u1', [], 25, undefined, 'tok'),
      payToGoal('g1', 'u1', 'u1', [], 25, undefined, 'tok'),
    ])

    // The whole point: the member's account is touched once.
    expect(mocks.submit).toHaveBeenCalledTimes(1)
    expect(a.status).toBe('fulfilled')
    expect(b.status).toBe('fulfilled')
  })

  it('tells the loser it was a duplicate rather than failing', async () => {
    // The second request must not surface a raw constraint violation as a 500 —
    // nothing went wrong from the member's side, they simply tapped twice.
    mocks.findByKey
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'pay-1', status: 'SUCCESS', amount: 25 })
    mocks.createPayment.mockRejectedValue(uniqueViolation())

    const res = await payToGoal('g1', 'u1', 'u1', [], 25, undefined, 'tok')

    expect(res.duplicate).toBe(true)
    expect(res.payment).toMatchObject({ id: 'pay-1' })
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it('claims the key before it charges', async () => {
    mocks.findByKey.mockResolvedValue(null)
    mocks.createPayment.mockResolvedValue({ id: 'pay-1', amount: 25, status: 'PENDING' })

    await payToGoal('g1', 'u1', 'u1', [], 25, undefined, 'tok')

    expect(mocks.createPayment.mock.invocationCallOrder[0]!)
      .toBeLessThan(mocks.submit.mock.invocationCallOrder[0]!)
    // Claimed as PENDING — it is not money until the gateway says so.
    expect(mocks.createPayment.mock.calls[0]![0]).toMatchObject({ status: 'PENDING' })
  })

  it('still lets a genuine second gift through on a new token', async () => {
    // The guard is on the intent, not on the member and the goal. Someone who
    // means to give twice must be able to.
    mocks.findByKey.mockResolvedValue(null)
    mocks.createPayment.mockResolvedValue({ id: 'pay-2', amount: 25, status: 'PENDING' })

    await payToGoal('g1', 'u1', 'u1', [], 25, undefined, 'tok-a')
    await payToGoal('g1', 'u1', 'u1', [], 25, undefined, 'tok-b')

    expect(mocks.submit).toHaveBeenCalledTimes(2)
  })

  it('does not swallow a failure that is not a collision', async () => {
    mocks.findByKey.mockResolvedValue(null)
    mocks.createPayment.mockRejectedValue(new Error('database is down'))

    await expect(payToGoal('g1', 'u1', 'u1', [], 25, undefined, 'tok'))
      .rejects.toThrow(/database is down/)
    expect(mocks.submit).not.toHaveBeenCalled()
  })
})
