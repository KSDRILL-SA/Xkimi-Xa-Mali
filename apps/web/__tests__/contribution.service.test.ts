import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Replace the validated env so the suite doesn't require real secrets at import.
vi.mock('@/lib/env', () => ({
  env: {
    ENCRYPTION_KEY: '0'.repeat(64),
    NETCASH_API_URL: 'https://netcash.test',
  },
}))

vi.mock('@/lib/cache', () => ({
  cache: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  },
  CACHE_KEYS: { DASHBOARD_STATS: 'xxm:cache:stats' },
}))

vi.mock('@/lib/db', () => {
  const db = {
    contribution: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    transaction: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    paymentMandate: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  }
  db.$transaction = vi.fn(async (fn: (tx: typeof db) => Promise<unknown>) => fn(db))
  return { db, Prisma: {} }
})

vi.mock('@/integrations/payment', () => ({
  paymentGateway: {
    submitOnceOffDebit: vi.fn(),
    mapTransactionStatus: vi.fn((status: string) => {
      const map: Record<string, string> = {
        SUCCESS: 'SUCCESS',
        FAILED: 'FAILED',
        REVERSED: 'REVERSED',
      }
      return map[status] ?? status
    }),
  },
}))

vi.mock('@/services/audit.service', () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { db } from '@/lib/db'
import { paymentGateway } from '@/integrations/payment'
import {
  recalculateContributionStatus,
  processTransactionWebhook,
  generateMonthlyContributions,
  getContributions,
  getContributionSummary,
} from '@/services/contribution.service'
import { ContributionNotFoundError, ForbiddenError } from '@/lib/errors'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2025-06-15T10:00:00Z')
const PAST = new Date('2025-05-01T00:00:00Z')

const baseContribution = {
  id: 'ctr-1',
  userId: 'user-1',
  periodMonth: 6,
  periodYear: 2025,
  amountDue: 500,
  amountPaid: 0,
  dueDate: new Date('2025-06-01'),
  status: 'PENDING',
  version: 1,
  createdAt: NOW,
  updatedAt: NOW,
}

function mockRecalculateUpdate() {
  ;(db.contribution.updateMany as MockedFunction<typeof db.contribution.updateMany>)
    .mockResolvedValue({ count: 1 } as never)
}

// ---------------------------------------------------------------------------
// recalculateContributionStatus
// ---------------------------------------------------------------------------

describe('recalculateContributionStatus', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets status PAID when amountPaid >= amountDue', async () => {
    ;(db.contribution.findUnique as MockedFunction<typeof db.contribution.findUnique>)
      .mockResolvedValue({ ...baseContribution, amountDue: 500, dueDate: new Date(Date.now() + 86400_000) } as never)
    ;(db.transaction.aggregate as MockedFunction<typeof db.transaction.aggregate>)
      .mockResolvedValue({ _sum: { amount: 500 } } as never)
    mockRecalculateUpdate()

    await recalculateContributionStatus('ctr-1')

    expect(db.contribution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ctr-1', version: 1 },
        data: expect.objectContaining({ status: 'PAID', amountPaid: 500, version: 2 }),
      }),
    )
  })

  it('sets status PARTIAL when 0 < amountPaid < amountDue', async () => {
    ;(db.contribution.findUnique as MockedFunction<typeof db.contribution.findUnique>)
      .mockResolvedValue({ ...baseContribution, amountDue: 500, dueDate: new Date(Date.now() + 86400_000) } as never)
    ;(db.transaction.aggregate as MockedFunction<typeof db.transaction.aggregate>)
      .mockResolvedValue({ _sum: { amount: 200 } } as never)
    mockRecalculateUpdate()

    await recalculateContributionStatus('ctr-1')

    expect(db.contribution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PARTIAL', amountPaid: 200 }),
      }),
    )
  })

  it('sets status OVERDUE when no payment and past dueDate', async () => {
    ;(db.contribution.findUnique as MockedFunction<typeof db.contribution.findUnique>)
      .mockResolvedValue({ ...baseContribution, amountDue: 500, dueDate: PAST } as never)
    ;(db.transaction.aggregate as MockedFunction<typeof db.transaction.aggregate>)
      .mockResolvedValue({ _sum: { amount: null } } as never)
    mockRecalculateUpdate()

    await recalculateContributionStatus('ctr-1')

    expect(db.contribution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'OVERDUE', amountPaid: 0 }),
      }),
    )
  })

  it('sets status PENDING when no payment and before dueDate', async () => {
    const futureDue = new Date(Date.now() + 86400_000 * 10)
    ;(db.contribution.findUnique as MockedFunction<typeof db.contribution.findUnique>)
      .mockResolvedValue({ ...baseContribution, amountDue: 500, dueDate: futureDue } as never)
    ;(db.transaction.aggregate as MockedFunction<typeof db.transaction.aggregate>)
      .mockResolvedValue({ _sum: { amount: 0 } } as never)
    mockRecalculateUpdate()

    await recalculateContributionStatus('ctr-1')

    expect(db.contribution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }),
    )
  })

  it('no-ops gracefully when contribution does not exist', async () => {
    ;(db.contribution.findUnique as MockedFunction<typeof db.contribution.findUnique>)
      .mockResolvedValue(null)
    ;(db.transaction.aggregate as MockedFunction<typeof db.transaction.aggregate>)
      .mockResolvedValue({ _sum: { amount: 0 } } as never)

    await recalculateContributionStatus('does-not-exist')
    expect(db.contribution.updateMany).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// processTransactionWebhook — idempotency & status mapping
// ---------------------------------------------------------------------------

describe('processTransactionWebhook', () => {
  beforeEach(() => vi.clearAllMocks())

  it('updates transaction status and recalculates contribution on settlement', async () => {
    const tx = {
      id: 'tx-1',
      contributionId: 'ctr-1',
      status: 'PENDING',
      gatewayRef: 'ref-1',
      processedAt: null,
      contribution: { userId: 'user-1' },
    }
    ;(db.transaction.findFirst as MockedFunction<typeof db.transaction.findFirst>)
      .mockResolvedValue(tx as never)
    ;(paymentGateway.mapTransactionStatus as MockedFunction<typeof paymentGateway.mapTransactionStatus>)
      .mockReturnValue('SUCCESS')
    ;(db.transaction.update as MockedFunction<typeof db.transaction.update>)
      .mockResolvedValue({} as never)
    ;(db.contribution.findUnique as MockedFunction<typeof db.contribution.findUnique>)
      .mockResolvedValue({ ...baseContribution, amountDue: 500, dueDate: new Date(Date.now() + 86400_000) } as never)
    ;(db.transaction.aggregate as MockedFunction<typeof db.transaction.aggregate>)
      .mockResolvedValue({ _sum: { amount: 500 } } as never)
    mockRecalculateUpdate()

    await processTransactionWebhook({
      transactionRef: 'ref-1',
      status: 'SUCCESSFUL',
      mandateId: 'mnd-1',
    })

    expect(db.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tx-1' },
        data: expect.objectContaining({ status: 'SUCCESS' }),
      }),
    )
    expect(db.contribution.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }),
    )
  })

  it('is idempotent — skips if incoming status equals current status', async () => {
    const tx = { id: 'tx-2', contributionId: 'ctr-1', status: 'SUCCESS', gatewayRef: 'ref-2' }
    ;(db.transaction.findFirst as MockedFunction<typeof db.transaction.findFirst>)
      .mockResolvedValue(tx as never)
    ;(paymentGateway.mapTransactionStatus as MockedFunction<typeof paymentGateway.mapTransactionStatus>)
      .mockReturnValue('SUCCESS')

    await processTransactionWebhook({ transactionRef: 'ref-2', status: 'SUCCESSFUL' })

    expect(db.transaction.update).not.toHaveBeenCalled()
  })

  it('is idempotent — skips if current status is already terminal SUCCESS', async () => {
    const tx = { id: 'tx-3', contributionId: 'ctr-1', status: 'SUCCESS', gatewayRef: 'ref-3' }
    ;(db.transaction.findFirst as MockedFunction<typeof db.transaction.findFirst>)
      .mockResolvedValue(tx as never)
    ;(paymentGateway.mapTransactionStatus as MockedFunction<typeof paymentGateway.mapTransactionStatus>)
      .mockReturnValue('PENDING')

    await processTransactionWebhook({ transactionRef: 'ref-3', status: 'PENDING' })

    expect(db.transaction.update).not.toHaveBeenCalled()
  })

  it('no-ops for unknown transactionRef', async () => {
    ;(db.transaction.findFirst as MockedFunction<typeof db.transaction.findFirst>)
      .mockResolvedValue(null)

    await processTransactionWebhook({ transactionRef: 'unknown-ref', status: 'SUCCESSFUL' })

    expect(db.transaction.update).not.toHaveBeenCalled()
    expect(db.contribution.updateMany).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// generateMonthlyContributions — N+1 eliminated: bulk check + createMany
// ---------------------------------------------------------------------------

describe('generateMonthlyContributions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('issues one bulk check query then one createMany — not N per mandate', async () => {
    const mandates = [
      { userId: 'u1', amount: 500, debitDay: 1, user: { id: 'u1', status: 'ACTIVE' } },
      { userId: 'u2', amount: 500, debitDay: 1, user: { id: 'u2', status: 'ACTIVE' } },
      { userId: 'u3', amount: 500, debitDay: 1, user: { id: 'u3', status: 'ACTIVE' } },
    ]

    ;(db.paymentMandate.findMany as MockedFunction<typeof db.paymentMandate.findMany>)
      .mockResolvedValue(mandates as never)

    // No existing contributions for this period
    ;(db.contribution.findMany as MockedFunction<typeof db.contribution.findMany>)
      .mockResolvedValue([])

    ;(db.contribution.createMany as MockedFunction<typeof db.contribution.createMany>)
      .mockResolvedValue({ count: 3 } as never)

    const result = await generateMonthlyContributions({ month: 6, year: 2025 }, 'admin-1', ['ADMIN'])

    expect(result).toEqual({ created: 3, skipped: 0, total: 3 })

    // Only ONE bulk check query, not 3 individual findUnique calls
    expect(db.contribution.findMany).toHaveBeenCalledOnce()
    expect(db.contribution.createMany).toHaveBeenCalledOnce()
    expect(db.contribution.findUnique).not.toHaveBeenCalled()
  })

  it('skips users who already have a contribution for the period', async () => {
    const mandates = [
      { userId: 'u1', amount: 500, debitDay: 1, user: { id: 'u1', status: 'ACTIVE' } },
      { userId: 'u2', amount: 500, debitDay: 1, user: { id: 'u2', status: 'ACTIVE' } },
    ]

    ;(db.paymentMandate.findMany as MockedFunction<typeof db.paymentMandate.findMany>)
      .mockResolvedValue(mandates as never)

    // u1 already has a contribution
    ;(db.contribution.findMany as MockedFunction<typeof db.contribution.findMany>)
      .mockResolvedValue([{ userId: 'u1' }] as never)

    ;(db.contribution.createMany as MockedFunction<typeof db.contribution.createMany>)
      .mockResolvedValue({ count: 1 } as never)

    const result = await generateMonthlyContributions({ month: 6, year: 2025 }, 'admin-1', ['ADMIN'])

    expect(result).toEqual({ created: 1, skipped: 1, total: 2 })

    // createMany only called for u2
    expect(db.contribution.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'u2' }),
        ]),
      }),
    )
  })

  it('does not call createMany when all contributions already exist', async () => {
    const mandates = [
      { userId: 'u1', amount: 500, debitDay: 1, user: { id: 'u1', status: 'ACTIVE' } },
    ]

    ;(db.paymentMandate.findMany as MockedFunction<typeof db.paymentMandate.findMany>)
      .mockResolvedValue(mandates as never)
    ;(db.contribution.findMany as MockedFunction<typeof db.contribution.findMany>)
      .mockResolvedValue([{ userId: 'u1' }] as never)

    const result = await generateMonthlyContributions({ month: 6, year: 2025 }, 'admin-1', ['ADMIN'])

    expect(result).toEqual({ created: 0, skipped: 1, total: 1 })
    expect(db.contribution.createMany).not.toHaveBeenCalled()
  })

  it('skips mandates belonging to non-ACTIVE users', async () => {
    const mandates = [
      { userId: 'u1', amount: 500, debitDay: 1, user: { id: 'u1', status: 'SUSPENDED' } },
      { userId: 'u2', amount: 500, debitDay: 1, user: { id: 'u2', status: 'ACTIVE' } },
    ]

    ;(db.paymentMandate.findMany as MockedFunction<typeof db.paymentMandate.findMany>)
      .mockResolvedValue(mandates as never)
    ;(db.contribution.findMany as MockedFunction<typeof db.contribution.findMany>)
      .mockResolvedValue([])
    ;(db.contribution.createMany as MockedFunction<typeof db.contribution.createMany>)
      .mockResolvedValue({ count: 1 } as never)

    const result = await generateMonthlyContributions({ month: 6, year: 2025 }, 'admin-1', ['ADMIN'])

    // u1 is SUSPENDED — filtered out before bulk check
    expect(result.total).toBe(1)
    expect(result.created).toBe(1)
  })

  it('throws ForbiddenError for non-admin caller', async () => {
    await expect(
      generateMonthlyContributions({ month: 6, year: 2025 }, 'user-1', ['MEMBER']),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })
})

// ---------------------------------------------------------------------------
// getContributions — pagination
// ---------------------------------------------------------------------------

describe('getContributions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns paginated contributions with correct meta', async () => {
    ;(db.contribution.findMany as MockedFunction<typeof db.contribution.findMany>)
      .mockResolvedValue([baseContribution] as never)
    ;(db.contribution.count as MockedFunction<typeof db.contribution.count>)
      .mockResolvedValue(25)

    const result = await getContributions('user-1', 'user-1', [], 2, 12)

    expect(result.items).toHaveLength(1)
    expect(result.total).toBe(25)
    expect(result.page).toBe(2)
    expect(result.limit).toBe(12)
    expect(result.totalPages).toBe(3) // ceil(25/12)
  })

  it('throws ForbiddenError when requester is different user without ADMIN role', async () => {
    await expect(
      getContributions('user-1', 'other-user', ['MEMBER'], 1, 12),
    ).rejects.toBeInstanceOf(ForbiddenError)
  })

  it('allows ADMIN to query any user', async () => {
    ;(db.contribution.findMany as MockedFunction<typeof db.contribution.findMany>)
      .mockResolvedValue([baseContribution] as never)
    ;(db.contribution.count as MockedFunction<typeof db.contribution.count>)
      .mockResolvedValue(1)

    await expect(
      getContributions('user-1', 'admin-user', ['ADMIN'], 1, 12),
    ).resolves.toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// getContributionSummary — DB-side aggregation (not JS in-memory)
// ---------------------------------------------------------------------------

describe('getContributionSummary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns aggregated totals from DB without loading all rows', async () => {
    ;(db.contribution.aggregate as MockedFunction<typeof db.contribution.aggregate>)
      .mockResolvedValueOnce({ _sum: { amountPaid: 6000 }, _count: { id: 12 } } as never) // all-time totals
      .mockResolvedValueOnce({ _sum: { amountPaid: 3000 } } as never) // yearly totals
    ;(db.contribution.groupBy as MockedFunction<typeof db.contribution.groupBy>)
      .mockResolvedValue([
        { status: 'PAID', _count: { status: 9 } },
        { status: 'OVERDUE', _count: { status: 2 } },
        { status: 'PENDING', _count: { status: 1 } },
      ] as never)

    const result = await getContributionSummary('user-1', 'user-1', [])

    expect(result.totalPaid).toBe(6000)
    expect(result.yearlyPaid).toBe(3000)
    expect(result.totalContributions).toBe(12)
    expect(result.paid).toBe(9)
    expect(result.overdue).toBe(2)
    expect(result.pending).toBe(1)

    // Must NOT call findMany — that would be the old JS-aggregation N+1 pattern
    expect(db.contribution.findMany).not.toHaveBeenCalled()
  })
})
