import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  db: {
    transaction: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    contribution: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
    },
  },
}))

vi.mock('@/integrations/storage', () => ({
  storageProvider: {
    upload: vi.fn(),
  },
}))

vi.mock('@/lib/pdf/statement', () => ({
  renderStatementPDF: vi.fn(),
}))

vi.mock('@/services/signature.service', () => ({
  verifySignatureExists: vi.fn(),
  embedSignatureInPdf: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { db } from '@/lib/db'
import { storageProvider } from '@/integrations/storage'
import { renderStatementPDF } from '@/lib/pdf/statement'
import { verifySignatureExists, embedSignatureInPdf } from '@/services/signature.service'
import { ForbiddenError, ReportNotFoundError } from '@/lib/errors'
import {
  getTransactionHistory,
  generateMemberStatement,
  getAdminReport,
  exportAdminReportCSV,
} from '@/services/report.service'

const ReportForbiddenError = ForbiddenError

// ---------------------------------------------------------------------------
// Typed mocks
// ---------------------------------------------------------------------------

const mockTxFindMany = db.transaction.findMany as MockedFunction<typeof db.transaction.findMany>
const mockTxCount    = db.transaction.count   as MockedFunction<typeof db.transaction.count>
const mockUserFindUnique = db.user.findUnique as MockedFunction<typeof db.user.findUnique>
const mockUserFindMany   = db.user.findMany   as MockedFunction<typeof db.user.findMany>
const mockContribFindMany = db.contribution.findMany as MockedFunction<typeof db.contribution.findMany>
const mockContribAggregate = db.contribution.aggregate as MockedFunction<typeof db.contribution.aggregate>
const mockUpload = storageProvider.upload as MockedFunction<typeof storageProvider.upload>
const mockRenderPDF      = renderStatementPDF as MockedFunction<typeof renderStatementPDF>
const mockVerifySignature = verifySignatureExists as MockedFunction<typeof verifySignatureExists>
const mockEmbedSignature  = embedSignatureInPdf  as MockedFunction<typeof embedSignatureInPdf>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ADMIN_ROLES = ['ADMIN']
const MEMBER_ROLES: string[] = []

const baseTx = {
  id: 'tx-1',
  amount: 500,
  type: 'DEBIT_ORDER',
  status: 'SUCCESS',
  gatewayRef: 'GW-123',
  idempotencyKey: 'key-1',
  processedAt: new Date('2025-05-01T10:00:00Z'),
  createdAt: new Date('2025-05-01T09:00:00Z'),
  contribution: { id: 'c-1', periodMonth: 5, periodYear: 2025, userId: 'user-1' },
}

const baseFilter = { page: 1, limit: 20 }

// ---------------------------------------------------------------------------
// getTransactionHistory
// ---------------------------------------------------------------------------

describe('getTransactionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws ReportForbiddenError when member queries another user', async () => {
    await expect(
      getTransactionHistory('user-2', 'user-1', MEMBER_ROLES, baseFilter),
    ).rejects.toBeInstanceOf(ReportForbiddenError)
  })

  it('allows admin to query any user', async () => {
    mockTxFindMany.mockResolvedValueOnce([baseTx] as never)
    mockTxCount.mockResolvedValueOnce(1)

    const result = await getTransactionHistory('user-2', 'user-1', ADMIN_ROLES, baseFilter)
    expect(result.total).toBe(1)
    expect(result.items[0].id).toBe('tx-1')
  })

  it('returns correctly serialised transaction fields', async () => {
    mockTxFindMany.mockResolvedValueOnce([baseTx] as never)
    mockTxCount.mockResolvedValueOnce(1)

    const result = await getTransactionHistory('user-1', 'user-1', MEMBER_ROLES, baseFilter)
    const item = result.items[0]

    expect(item.amount).toBe(500)
    expect(item.period).toBe('May 2025')
    expect(item.createdAt).toBe(new Date('2025-05-01T09:00:00Z').toISOString())
  })

  it('applies status filter in where clause', async () => {
    mockTxFindMany.mockResolvedValueOnce([] as never)
    mockTxCount.mockResolvedValueOnce(0)

    await getTransactionHistory('user-1', 'user-1', MEMBER_ROLES, { ...baseFilter, status: 'FAILED' })

    const callArgs = mockTxFindMany.mock.calls[0][0] as { where: { status?: string } }
    expect(callArgs.where.status).toBe('FAILED')
  })

  it('applies date range filter', async () => {
    mockTxFindMany.mockResolvedValueOnce([] as never)
    mockTxCount.mockResolvedValueOnce(0)

    await getTransactionHistory('user-1', 'user-1', MEMBER_ROLES, {
      ...baseFilter,
      from: '2025-05-01',
      to: '2025-05-31',
    })

    const callArgs = mockTxFindMany.mock.calls[0][0] as { where: { createdAt?: { gte?: Date; lte?: Date } } }
    expect(callArgs.where.createdAt?.gte).toEqual(new Date('2025-05-01'))
  })

  it('paginates correctly', async () => {
    mockTxFindMany.mockResolvedValueOnce([] as never)
    mockTxCount.mockResolvedValueOnce(55)

    const result = await getTransactionHistory('user-1', 'user-1', MEMBER_ROLES, { page: 3, limit: 20 })
    expect(result.totalPages).toBe(3)
    expect(result.page).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// generateMemberStatement
// ---------------------------------------------------------------------------

describe('generateMemberStatement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws ReportForbiddenError for cross-user access by member', async () => {
    await expect(
      generateMemberStatement('user-2', 'user-1', MEMBER_ROLES, 5, 2025),
    ).rejects.toBeInstanceOf(ReportForbiddenError)
  })

  it('throws ReportNotFoundError when user does not exist', async () => {
    mockUserFindMany.mockResolvedValueOnce([])

    await expect(
      generateMemberStatement('user-1', 'user-1', MEMBER_ROLES, 5, 2025),
    ).rejects.toBeInstanceOf(ReportNotFoundError)
  })

  it('generates PDF, uploads to blob and returns urls', async () => {
    mockVerifySignature.mockResolvedValueOnce({
      signatureUrl: 'https://blob.vercel.com/signatures/admin-1/sig.png',
      displayName: 'Maluleke Kurhula Success',
    } as never)
    mockEmbedSignature.mockResolvedValueOnce('data:image/png;base64,fakedata')

    mockUserFindMany.mockResolvedValueOnce([{
      firstName: 'Sipho', lastName: 'Dlamini', email: 's@test.com', phone: '+27821234567',
    }] as never)

    mockContribFindMany.mockResolvedValueOnce([
      {
        id: 'c-1',
        periodMonth: 5,
        periodYear: 2025,
        amountDue: 500,
        amountPaid: 500,
        dueDate: new Date('2025-05-07'),
        status: 'PAID',
        transactions: [],
      },
    ] as never)

    const fakeBuffer = Buffer.from('PDF_CONTENT')
    mockRenderPDF.mockResolvedValueOnce(fakeBuffer)
    mockUpload.mockResolvedValueOnce({
      url: 'https://blob.vercel.com/statements/user-1/2025-05.pdf',
      signedUrl: 'https://blob.vercel.com/signed-url',
    })

    const result = await generateMemberStatement('user-1', 'user-1', MEMBER_ROLES, 5, 2025)

    expect(mockUpload).toHaveBeenCalledWith(
      'statements/user-1/2025-05.pdf',
      fakeBuffer,
      expect.objectContaining({ access: 'public', contentType: 'application/pdf', addRandomSuffix: false }),
    )
    expect(result.url).toBe('https://blob.vercel.com/statements/user-1/2025-05.pdf')
    expect(result.signedUrl).toBe('https://blob.vercel.com/signed-url')
  })
})

// ---------------------------------------------------------------------------
// getAdminReport
// ---------------------------------------------------------------------------

describe('getAdminReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUserFindMany.mockReset()
    mockContribFindMany.mockReset()
    mockContribAggregate.mockReset()
  })

  it('returns period label, summary and per-member rows', async () => {
    mockUserFindMany.mockResolvedValue([
      {
        id: 'user-1',
        firstName: 'Sipho',
        lastName: 'Dlamini',
        email: 's@test.com',
        phone: '+27821234567',
        status: 'ACTIVE',
        contributions: [{ id: 'c-1', periodMonth: 5, periodYear: 2025, amountDue: 500, amountPaid: 500, status: 'PAID' }],
      },
    ] as never)

    mockContribFindMany.mockResolvedValue([
      { amountDue: 500, amountPaid: 500, status: 'PAID' },
    ] as never)

    mockContribAggregate.mockResolvedValue({ _sum: { amountPaid: 5000 } } as never)

    const report = await getAdminReport(5, 2025)

    expect(report.period.label).toBe('May 2025')
    expect(report.summary.totalDue).toBe(500)
    expect(report.summary.totalPaid).toBe(500)
    expect(report.summary.collectionRate).toBe(100)
    expect(report.summary.poolTotal).toBe(5000)
    expect(report.members[0].name).toBe('Sipho Dlamini')
    expect(report.members[0].status).toBe('PAID')
  })

  it('returns NO_RECORD status for members with no contribution this period', async () => {
    mockUserFindMany.mockResolvedValue([
      {
        id: 'user-2',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'j@test.com',
        phone: '+27831234567',
        status: 'ACTIVE',
        contributions: [],
      },
    ] as never)

    mockContribFindMany.mockResolvedValue([] as never)
    mockContribAggregate.mockResolvedValue({ _sum: { amountPaid: null } } as never)

    const report = await getAdminReport(6, 2025)

    expect(report.members[0].status).toBe('NO_RECORD')
    expect(report.members[0].amountDue).toBe(0)
    expect(report.summary.collectionRate).toBe(0)
    expect(report.summary.poolTotal).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// exportAdminReportCSV
// ---------------------------------------------------------------------------

describe('exportAdminReportCSV', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUserFindMany.mockReset()
    mockContribFindMany.mockReset()
    mockContribAggregate.mockReset()
  })

  it('returns a valid CSV string with header and summary rows', async () => {
    mockUserFindMany.mockResolvedValue([
      {
        id: 'user-1',
        firstName: 'Sipho',
        lastName: 'Dlamini',
        email: 's@test.com',
        phone: '+27821234567',
        status: 'ACTIVE',
        contributions: [{ id: 'c-1', periodMonth: 5, periodYear: 2025, amountDue: 500, amountPaid: 500, status: 'PAID' }],
      },
    ] as never)

    mockContribFindMany.mockResolvedValue([
      { amountDue: 500, amountPaid: 500, status: 'PAID' },
    ] as never)

    mockContribAggregate.mockResolvedValue({ _sum: { amountPaid: 5000 } } as never)

    const csv = await exportAdminReportCSV(5, 2025)
    const lines = csv.split('\n')

    expect(lines[0]).toBe('Name,Email,Phone,Amount Due,Amount Paid,Outstanding,Status')
    expect(lines[1]).toContain('"Sipho Dlamini"')
    expect(lines[1]).toContain('500.00')
    expect(lines).toContain('"Total Paid",500.00')
    expect(lines).toContain('"Collection Rate",100%')
  })
})
