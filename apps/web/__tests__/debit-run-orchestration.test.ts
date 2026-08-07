import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * The debit run, end to end, through a stub step runner.
 *
 * Every one of these guards a defect that shipped and that 786 passing tests
 * did not see, because the only thing reachable from a test was the batch
 * helper — never the orchestration where the money decisions are made.
 */

const mocks = vi.hoisted(() => ({
  findMandates: vi.fn(),
  txFindUnique: vi.fn(),
  txCreate: vi.fn(),
  contribFindUnique: vi.fn(),
  contribCreate: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  submitScheduledDebit: vi.fn(),
  queueNotification: vi.fn(),
  notifyAdmins: vi.fn(),
  writeAuditLog: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock('@/lib/env', () => ({
  env: { NEXTAUTH_URL: 'https://app.example.test', ENCRYPTION_KEY: '0'.repeat(64) },
}))
vi.mock('@/lib/inngest', () => ({
  inngest: { createFunction: () => ({}) },
}))
vi.mock('@/lib/db', () => ({
  Prisma: {},
  db: {
    paymentMandate: { findMany: mocks.findMandates },
    transaction: { findUnique: mocks.txFindUnique, create: mocks.txCreate },
    contribution: { findUnique: mocks.contribFindUnique, create: mocks.contribCreate },
  },
}))
vi.mock('@/lib/redis', () => ({ redis: { get: mocks.redisGet, set: mocks.redisSet } }))
vi.mock('@/lib/date', () => ({ todaySAST: () => '2026-08-01' }))
vi.mock('@/integrations/payment', () => ({
  paymentGateway: { submitScheduledDebit: mocks.submitScheduledDebit },
}))
vi.mock('@/lib/group-account', () => ({ debitAmountWithFee: (n: number) => n }))
vi.mock('@/services/contribution.service', () => ({
  recalculateContributionStatus: vi.fn(),
  invalidateContributionSummaryCache: vi.fn(),
}))
vi.mock('@/services/goal.service', () => ({ syncPrimaryGoalProgress: vi.fn() }))
vi.mock('@/services/budget.service', () => ({
  checkBudget: vi.fn().mockResolvedValue({ status: 'OK', budget: 0 }),
}))
vi.mock('@/services/notification.service', () => ({ queueNotification: mocks.queueNotification }))
vi.mock('@/services/inbox.service', () => ({ notifyAdmins: mocks.notifyAdmins }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/cache', () => ({ cache: { del: vi.fn() }, CACHE_KEYS: { DASHBOARD_STATS: 'k' } }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: mocks.loggerError, debug: vi.fn() },
}))

import { executeDebitRun } from '@/inngest/functions/debit-run'

/** Runs each step body immediately, in order — the shape Inngest guarantees. */
const step = { run: async <T>(_id: string, fn: () => Promise<T> | T): Promise<T> => fn() }

function mandate(id: string) {
  return {
    id,
    userId: `user-${id}`,
    amount: 500,
    debitDay: 1,
    netcashMandateId: `nc-${id}`,
    delayedUntil: null,
    user: { id: `user-${id}`, status: 'ACTIVE' },
  }
}

const slugsSent = () => mocks.queueNotification.mock.calls.map((c) => c[0].templateSlug)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.redisGet.mockResolvedValue(null)
  mocks.redisSet.mockResolvedValue('OK')
  mocks.txFindUnique.mockResolvedValue(null)
  mocks.txCreate.mockImplementation(({ data }: never) => Promise.resolve({ id: 'tx-1', ...(data as object) }))
  mocks.contribFindUnique.mockResolvedValue(null)
  mocks.contribCreate.mockResolvedValue({ id: 'contrib-1', status: 'PENDING' })
  mocks.queueNotification.mockResolvedValue(undefined)
  mocks.notifyAdmins.mockResolvedValue(1)
  mocks.writeAuditLog.mockResolvedValue(undefined)
})

describe('executeDebitRun — a gateway that throws', () => {
  beforeEach(() => {
    mocks.findMandates.mockResolvedValue([mandate('a'), mandate('b'), mandate('c')])
    mocks.submitScheduledDebit.mockImplementation(({ mandateId }: { mandateId: string }) =>
      mandateId === 'nc-b'
        ? Promise.reject(new Error('gateway unreachable'))
        : Promise.resolve({ status: 'SUCCESS', transactionRef: 'ref' }),
    )
  })

  it('records the failure as a FAILED transaction the retry job can find', async () => {
    await executeDebitRun(step)

    const failed = mocks.txCreate.mock.calls
      .map((c) => c[0].data)
      .filter((d: { status: string }) => d.status === 'FAILED')

    expect(failed).toHaveLength(1)
    expect(failed[0].mandateId).toBe('b')
    // transaction-retry-failed queries status FAILED. Without this row there is
    // no trace at all, and the mandate is not due again until next month.
    expect(failed[0].failureReason).toContain('gateway unreachable')
  })

  it('marks it as infrastructure so the member is not judged for an outage', async () => {
    await executeDebitRun(step)

    const failed = mocks.txCreate.mock.calls
      .map((c) => c[0].data)
      .find((d: { status: string }) => d.status === 'FAILED')

    expect(failed.failureReason.startsWith('INFRASTRUCTURE: ')).toBe(true)
  })

  it('does not tell the member their debit was declined — nothing was', async () => {
    await executeDebitRun(step)
    expect(slugsSent()).not.toContain('debit-declined')
  })

  it('still collects from every other mandate', async () => {
    const summary = await executeDebitRun(step)
    expect(summary.collected).toBe(2)
    expect(summary.infrastructure).toBe(1)
  })

  it('tells the admins money did not arrive', async () => {
    await executeDebitRun(step)

    expect(mocks.notifyAdmins).toHaveBeenCalledOnce()
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEBIT_RUN_INCOMPLETE' }),
    )
  })
})

describe('executeDebitRun — a gateway that declines', () => {
  beforeEach(() => {
    mocks.findMandates.mockResolvedValue([mandate('a')])
    mocks.submitScheduledDebit.mockResolvedValue({ status: 'FAILED', reason: 'insufficient funds' })
  })

  it('writes FAILED, not PENDING', async () => {
    await executeDebitRun(step)

    // Writing PENDING here is what hid declines from the retry job and left the
    // contribution waiting on a settlement webhook that was never coming.
    expect(mocks.txCreate.mock.calls[0][0].data.status).toBe('FAILED')
  })

  it('sends debit-declined, with the url the template renders', async () => {
    await executeDebitRun(step)

    const call = mocks.queueNotification.mock.calls[0][0]
    expect(call.templateSlug).toBe('debit-declined')
    // An unsupplied placeholder is not dropped — it reaches the member as {{url}}.
    expect(call.payload.url).toBe('https://app.example.test')
  })

  it('counts as a decline, not an outage', async () => {
    const summary = await executeDebitRun(step)
    expect(summary.declined).toBe(1)
    expect(summary.infrastructure).toBe(0)
  })
})

describe('executeDebitRun — a clean run', () => {
  beforeEach(() => {
    mocks.findMandates.mockResolvedValue([mandate('a'), mandate('b')])
    mocks.submitScheduledDebit.mockResolvedValue({ status: 'SUCCESS', transactionRef: 'ref' })
  })

  it('collects everything and says so', async () => {
    const summary = await executeDebitRun(step)

    expect(summary).toMatchObject({ period: '2026-08', due: 2, collected: 2, declined: 0, infrastructure: 0 })
    expect(slugsSent()).toEqual(['debit-success', 'debit-success'])
  })

  it('does not wake the admins when nothing is wrong', async () => {
    await executeDebitRun(step)
    expect(mocks.notifyAdmins).not.toHaveBeenCalled()
  })
})

describe('executeDebitRun — mandates it must leave alone', () => {
  it('skips a member who moved their debit, without charging them', async () => {
    const delayed = { ...mandate('a'), delayedUntil: new Date(Date.now() + 86_400_000) }
    mocks.findMandates.mockResolvedValue([delayed])

    const summary = await executeDebitRun(step)

    expect(mocks.submitScheduledDebit).not.toHaveBeenCalled()
    expect(summary.skipped).toBe(1)
  })

  it('does not debit twice when the period was already claimed', async () => {
    mocks.findMandates.mockResolvedValue([mandate('a')])
    mocks.redisGet.mockResolvedValue('1')

    const summary = await executeDebitRun(step)

    expect(mocks.submitScheduledDebit).not.toHaveBeenCalled()
    expect(summary.skipped).toBe(1)
  })

  it('ignores a suspended member and one with no gateway mandate', async () => {
    mocks.findMandates.mockResolvedValue([
      { ...mandate('a'), user: { id: 'user-a', status: 'SUSPENDED' } },
      { ...mandate('b'), netcashMandateId: null },
    ])

    const summary = await executeDebitRun(step)

    expect(mocks.submitScheduledDebit).not.toHaveBeenCalled()
    expect(summary.due).toBe(0)
  })
})
