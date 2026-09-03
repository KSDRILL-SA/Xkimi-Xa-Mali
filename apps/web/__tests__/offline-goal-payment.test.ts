import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Recording money a member gave toward a goal, outside the gateway.
 *
 * The gap this fills is the same one twice. `payToGoal` requires an active
 * Netcash mandate, and the DebiCheck application was declined — so no member
 * can reach a goal through the gateway at all. The only other route was an
 * admin recording goal progress, which is a different thing in similar
 * clothes: it moves a goal's total with no member attached and refuses the
 * primary fund. A member who handed over cash for a goal could not be recorded
 * as having given anything.
 *
 * What these guard hardest is the two rules that decide whether a payment can
 * be checked at all: what it is FOR, and whether it has already been recorded.
 */

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  findGoal: vi.fn(),
  findByKey: vi.fn(),
  createPayment: vi.fn(),
  writeAuditLog: vi.fn(),
  inbox: vi.fn(),
  syncPrimary: vi.fn(),
  syncAdditional: vi.fn(),
  poolCredit: vi.fn(),
  queueNotification: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: { user: { findUnique: mocks.findUser } } }))
vi.mock('@/lib/env', () => ({ env: { ENABLE_MANUAL_PAYMENTS: true } }))
vi.mock('@xxm/observability', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/services/inbox.service', () => ({ createInboxMessages: mocks.inbox }))
vi.mock('@/services/notification.service', () => ({ queueNotification: mocks.queueNotification }))
vi.mock('@/services/ledger.service', () => ({
  postPoolCredit: mocks.poolCredit,
  postPoolDebit: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/services/goal.service', () => ({
  syncPrimaryGoalProgress: mocks.syncPrimary,
  syncAdditionalGoalProgress: mocks.syncAdditional,
}))
vi.mock('@/integrations/payment', () => ({ paymentGateway: {} }))
vi.mock('@/repositories/mandate.repository', () => ({ mandateRepo: { findActiveByUser: vi.fn() } }))
vi.mock('@/repositories/goal.repository', () => ({
  goalRepo: {
    findById: mocks.findGoal,
    findPaymentByIdempotencyKey: mocks.findByKey,
    createPayment: mocks.createPayment,
    updatePayment: vi.fn(),
    sumSuccessfulPayments: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }),
  },
}))

import { recordOfflineGoalPayment } from '@/services/goal-payment.service'

const ADMIN = 'admin-1'
const ROLES = ['ADMIN']

const GOAL = {
  id: 'goal-1', status: 'ACTIVE', isPrimary: false,
  title: 'Catering equipment', targetAmount: 50000, currentAmount: 12000,
}

const payment = (over: Record<string, unknown> = {}) => ({
  userId: 'member-1',
  goalId: 'goal-1',
  amount: 500,
  receivedAt: new Date('2026-08-15'),
  reference: 'EFT 4471',
  proofUrl: 'payment-proofs/proof-abc.pdf',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findUser.mockResolvedValue({ id: 'member-1', status: 'ACTIVE', firstName: 'Kurhula' })
  mocks.findGoal.mockResolvedValue({ ...GOAL })
  mocks.findByKey.mockResolvedValue(null)
  mocks.createPayment.mockImplementation(async (data: object) => ({ id: 'gp-1', ...data }))
  mocks.inbox.mockResolvedValue(undefined)
  mocks.poolCredit.mockResolvedValue(undefined)
  mocks.queueNotification.mockResolvedValue(undefined)
  mocks.syncAdditional.mockResolvedValue(undefined)
  mocks.syncPrimary.mockResolvedValue(undefined)
})

describe('what the payment is for', () => {
  it('refuses the primary fund, and says where the money belongs instead', async () => {
    // The fund fills from monthly contributions, and directed payments are
    // added ON TOP of them. So recording somebody's ordinary monthly money here
    // would raise the fund total while leaving their month showing unpaid — and
    // the debit run would go on trying to collect money already in the account.
    mocks.findGoal.mockResolvedValue({ ...GOAL, isPrimary: true, title: 'The fund' })

    await expect(recordOfflineGoalPayment(payment() as never, ADMIN, ROLES))
      .rejects.toThrow(/monthly contributions/i)

    expect(mocks.createPayment).not.toHaveBeenCalled()
  })

  it('refuses a goal that is not active', async () => {
    // Achieved, draft or rejected. Money cannot be given to any of them, and
    // the picker does not offer them either.
    for (const status of ['DRAFT', 'ACHIEVED', 'REJECTED']) {
      mocks.findGoal.mockResolvedValue({ ...GOAL, status })
      await expect(recordOfflineGoalPayment(payment() as never, ADMIN, ROLES))
        .rejects.toThrow(/active goal/i)
    }
    expect(mocks.createPayment).not.toHaveBeenCalled()
  })

  it('refuses a goal that does not exist', async () => {
    mocks.findGoal.mockResolvedValue(null)

    await expect(recordOfflineGoalPayment(payment() as never, ADMIN, ROLES)).rejects.toThrow()
    expect(mocks.createPayment).not.toHaveBeenCalled()
  })
})

describe('whether it has already been recorded', () => {
  it('keys the duplicate check on the goal as well as the member and reference', async () => {
    // The reason the form has to ask what the money is for. Without the goal in
    // the key, a member giving to two goals on one day under a lazy reference
    // would have the second refused as a duplicate of the first.
    await recordOfflineGoalPayment(payment() as never, ADMIN, ROLES)

    expect(mocks.findByKey).toHaveBeenCalledWith('goal-offline:goal-1:member-1:eft 4471')
  })

  it('refuses the same reference against the same goal twice', async () => {
    // A double-submitted form, or two admins working from one bank statement.
    // The second would otherwise credit the goal twice for one payment.
    mocks.findByKey.mockResolvedValue({ id: 'gp-existing' })

    await expect(recordOfflineGoalPayment(payment() as never, ADMIN, ROLES))
      .rejects.toThrow(/already recorded/i)

    expect(mocks.createPayment).not.toHaveBeenCalled()
  })

  it('allows the same reference against a different goal', async () => {
    // Two real payments on one day, and the key separates them.
    await recordOfflineGoalPayment(payment({ goalId: 'goal-2' }) as never, ADMIN, ROLES)

    expect(mocks.findByKey).toHaveBeenCalledWith('goal-offline:goal-2:member-1:eft 4471')
    expect(mocks.createPayment).toHaveBeenCalled()
  })
})

describe('the payment it writes', () => {
  it('is SUCCESS with no gateway reference, and carries the bank one instead', async () => {
    await recordOfflineGoalPayment(payment() as never, ADMIN, ROLES)

    const [written] = mocks.createPayment.mock.calls[0]
    expect(written.status).toBe('SUCCESS')
    expect(written.gatewayRef).toBeNull()
    expect(written.offlineReference).toBe('EFT 4471')
    expect(written.recordedById).toBe(ADMIN)
  })

  it('dates the payment when the money arrived, not when it was captured', async () => {
    await recordOfflineGoalPayment(
      payment({ receivedAt: new Date('2026-06-15') }) as never, ADMIN, ROLES,
    )

    expect(mocks.createPayment.mock.calls[0][0].processedAt).toEqual(new Date('2026-06-15'))
  })

  it('keeps the evidence, so the goal total can be traced to a document', async () => {
    await recordOfflineGoalPayment(payment() as never, ADMIN, ROLES)

    const [written] = mocks.createPayment.mock.calls[0]
    expect(written.proofUrl).toBe('payment-proofs/proof-abc.pdf')
    expect(written.proofWitness).toBeNull()
  })

  it('keeps a witness note instead, when the money was cash', async () => {
    await recordOfflineGoalPayment(
      payment({
        proofUrl: undefined,
        proofWitness: 'Counted by Kurhula and Thandi at the August meeting',
      }) as never,
      ADMIN,
      ROLES,
    )

    const [written] = mocks.createPayment.mock.calls[0]
    expect(written.proofUrl).toBeNull()
    expect(written.proofWitness).toContain('Kurhula and Thandi')
  })
})

describe('what happens once it lands', () => {
  it('re-derives the goal rather than adding to a running total', async () => {
    // A goal's figure is DERIVED from the SUCCESS sum, which is what makes it
    // reversal-safe: remove the row and the next sync reflects the smaller
    // total. Incrementing could only ever go up.
    await recordOfflineGoalPayment(payment() as never, ADMIN, ROLES)

    expect(mocks.syncAdditional).toHaveBeenCalledWith('goal-1')
    expect(mocks.syncPrimary).not.toHaveBeenCalled()
  })

  it('credits the pool ledger, like every other settled payment', async () => {
    await recordOfflineGoalPayment(payment() as never, ADMIN, ROLES)

    expect(mocks.poolCredit).toHaveBeenCalledWith(
      expect.objectContaining({ refType: 'GOAL_PAYMENT', amount: 500, memberId: 'member-1' }),
    )
  })

  it('tells the member money was recorded against their name', async () => {
    await recordOfflineGoalPayment(payment() as never, ADMIN, ROLES)

    expect(mocks.inbox).toHaveBeenCalledWith(
      ['member-1'],
      expect.objectContaining({ title: expect.stringContaining('Catering equipment') }),
    )
  })

  it('records the kind of evidence in the audit log, never the pathname', async () => {
    // That log is read by people who are not entitled to open the document.
    await recordOfflineGoalPayment(payment() as never, ADMIN, ROLES)

    const [entry] = mocks.writeAuditLog.mock.calls[0]
    expect(entry.action).toBe('OFFLINE_GOAL_PAYMENT_RECORDED')
    expect(entry.payload.evidence).toBe('DOCUMENT')
    expect(JSON.stringify(entry.payload)).not.toContain('payment-proofs/')
  })

  it('records the payment even when telling the member fails', async () => {
    // The money is committed by this point. A failed inbox write must not
    // surface as an error the admin retries, or the same payment is recorded
    // twice.
    mocks.inbox.mockRejectedValue(new Error('inbox down'))

    await expect(recordOfflineGoalPayment(payment() as never, ADMIN, ROLES))
      .resolves.toMatchObject({ paymentId: 'gp-1' })
  })
})

describe('who may record one', () => {
  it('refuses a caller who is not an admin', async () => {
    await expect(
      recordOfflineGoalPayment(payment() as never, 'member-9', ['MEMBER']),
    ).rejects.toThrow()

    expect(mocks.createPayment).not.toHaveBeenCalled()
  })

  it('refuses a member who does not exist', async () => {
    mocks.findUser.mockResolvedValue(null)

    await expect(recordOfflineGoalPayment(payment() as never, ADMIN, ROLES)).rejects.toThrow()
    expect(mocks.createPayment).not.toHaveBeenCalled()
  })
})
