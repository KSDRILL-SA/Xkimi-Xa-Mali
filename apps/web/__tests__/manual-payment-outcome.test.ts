import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The fourth copy of a defect that was fixed three times.
 *
 * The gateway answers with SUCCESS, PENDING or FAILED. `submitManualPayment`
 * collapsed those onto two — `status === 'SUCCESS' ? 'SUCCESS' : 'PENDING'` —
 * exactly as `debit-run`, `transaction-retry-failed` and
 * `mandate-delay-handler` each did before §4.6. Those three were found, fixed,
 * and held to `toTransactionStatus` by a test. This one was never looked at,
 * because it is not a job.
 *
 * It cost more here than in any of them, because a person is watching:
 *
 *   - the member was told "Payment submitted!"
 *   - the row sat PENDING waiting on a webhook that was never coming, the bank
 *     having already refused
 *   - `transaction-retry-failed` queries `status: 'FAILED'`, so it never
 *     recovered it
 *   - the contribution was never settled
 *   - no payment-failed message was sent, because those are keyed off FAILED
 *
 * The member believed they had paid and nothing ever contradicted them.
 */

const mocks = vi.hoisted(() => ({
  submitOnceOffDebit: vi.fn(),
  findActiveByUser: vi.fn(),
  findByPeriod: vi.fn(),
  txCreate: vi.fn(),
  runTransaction: vi.fn(),
  checkBudget: vi.fn(),
  recalculate: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: { ENABLE_MANUAL_PAYMENTS: true } }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: vi.fn() }))
vi.mock('@/services/budget.service', () => ({
  checkBudget: mocks.checkBudget,
  recordBudgetOverride: vi.fn(),
}))
vi.mock('@/services/goal.service', () => ({ syncPrimaryGoalProgress: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/ledger.service', () => ({ postPoolCredit: vi.fn().mockResolvedValue(undefined), postPoolDebit: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/notification.service', () => ({ queueNotification: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/cache', () => ({ cache: { del: vi.fn().mockResolvedValue(undefined), get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined) }, CACHE_KEYS: { DASHBOARD_STATS: 'k', memberInsights: (id: string) => 'insights:' + id, contributionSummary: (id: string) => 'summary:' + id } }))
vi.mock('@/lib/inngest', () => ({ inngest: { send: vi.fn().mockResolvedValue(undefined) }, InngestEvents: {} }))
vi.mock('@xxm/observability', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/integrations/payment', () => ({
  paymentGateway: { submitOnceOffDebit: mocks.submitOnceOffDebit },
}))
vi.mock('@/repositories/mandate.repository', () => ({
  mandateRepo: { findActiveByUser: mocks.findActiveByUser },
}))
vi.mock('@/repositories/budget.repository', () => ({ budgetRepo: { findActiveByType: vi.fn() } }))
vi.mock('@/repositories/transaction.repository', () => ({
  transactionRepo: { create: mocks.txCreate, aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }) },
  SUCCESSFUL_INFLOW: {},
}))
vi.mock('@/repositories/contribution.repository', () => ({
  contributionRepo: {
    findByPeriod: mocks.findByPeriod,
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    updateByVersion: vi.fn().mockResolvedValue({ count: 1 }),
    findUniqueWithVersion: vi.fn().mockResolvedValue({ id: 'contrib-1', amountDue: 450, amountPaid: 0, dueDate: new Date(), version: 1, status: 'PENDING' }),
  },
  runTransaction: mocks.runTransaction,
}))

import { submitManualPayment } from '@/services/contribution.service'

const PAYMENT = { periodMonth: 8, periodYear: 2026, amount: 450 }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findActiveByUser.mockResolvedValue({
    id: 'mandate-1', netcashMandateId: 'NC-1', amount: 450, debitDay: 25,
  })
  mocks.findByPeriod.mockResolvedValue({
    id: 'contrib-1', status: 'PENDING', amountDue: 450, amountPaid: 0,
  })
  mocks.checkBudget.mockResolvedValue({ status: 'OK', budget: 1000 })
  mocks.runTransaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) =>
    fn({ contribution: { update: vi.fn() } }),
  )
  mocks.txCreate.mockImplementation(async (data: { status: string }) => ({ id: 'tx-1', ...data }))
})

describe('what the bank actually said', () => {
  it('records a decline as FAILED, not as PENDING', async () => {
    mocks.submitOnceOffDebit.mockResolvedValue({ status: 'FAILED', reason: 'insufficient funds' })

    const result = await submitManualPayment('user-1', PAYMENT, 'user-1', [])

    expect(mocks.txCreate.mock.calls[0][0].status).toBe('FAILED')
    expect(result.status).toBe('FAILED')
  })

  it('leaves a genuinely pending collection as PENDING', async () => {
    // A batch upload returns a file token, not a settlement. PENDING is the
    // honest answer for that one and must stay reachable.
    mocks.submitOnceOffDebit.mockResolvedValue({ status: 'PENDING' })

    const result = await submitManualPayment('user-1', PAYMENT, 'user-1', [])

    expect(mocks.txCreate.mock.calls[0][0].status).toBe('PENDING')
    expect(result.status).toBe('PENDING')
  })

  it('records a settled collection as SUCCESS', async () => {
    mocks.submitOnceOffDebit.mockResolvedValue({ status: 'SUCCESS', transactionRef: 'ref-1' })

    const result = await submitManualPayment('user-1', PAYMENT, 'user-1', [])

    expect(mocks.txCreate.mock.calls[0][0].status).toBe('SUCCESS')
    expect(result.status).toBe('SUCCESS')
  })

  it('does not settle the contribution on a decline', async () => {
    // A FAILED row must not mark the period paid, and must leave a row the
    // retry job can find — it queries status: 'FAILED'.
    mocks.submitOnceOffDebit.mockResolvedValue({ status: 'FAILED' })

    await submitManualPayment('user-1', PAYMENT, 'user-1', [])

    expect(mocks.txCreate.mock.calls[0][0].processedAt).toBeNull()
  })

  it('uses the shared mapper rather than a fourth copy of the rule', async () => {
    // Three jobs already import `toTransactionStatus`. A local ternary here is
    // how the same defect survived three separate fixes.
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const source = readFileSync(resolve(__dirname, '../services/contribution.service.ts'), 'utf8')

    expect(source).toContain("from '@/lib/transaction-status'")
    expect(source).not.toMatch(/status === 'SUCCESS' \? 'SUCCESS' : 'PENDING'/)
  })
})

describe('the page can tell the member which of the three happened', () => {
  const page = async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    return readFileSync(
      resolve(__dirname, '../app/(member)/dashboard/contribute/page.tsx'),
      'utf8',
    )
  }

  it('does not show success for a refused payment', async () => {
    // "Payment submitted!" was shown for every response that did not throw.
    const source = await page()
    expect(source).toContain("status === 'FAILED'")
    expect(source).toMatch(/bank refused this payment/i)
  })

  it('offers the budget guard rather than a dead end', async () => {
    // `submitManualPayment` refuses with BUDGET_001 unless
    // budgetOverrideConfirmed is sent. This form never sent it and never
    // offered the modal that collects it, so a member over their own budget was
    // hard-blocked on the one page whose purpose is taking a payment.
    const source = await page()
    expect(source).toContain('BudgetGuardModal')
    expect(source).toContain("err.code === 'BUDGET_001'")
    expect(source).toContain('budgetOverrideConfirmed: true')
  })
})
