import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Everything the transaction history took on trust.
 *
 * The transactions *page* allow-lists its status and type filters. The API
 * route serving the same data through the same function did not, and neither
 * did the function. So `?limit=1000000` was a million rows with a join,
 * `?page=abc` reached Prisma as `skip: NaN`, `?page=-5` as a negative skip, and
 * `?status=nonsense` as an invalid enum — each of them a 500 or a very
 * expensive query, available to any signed-in member and, through `?userId=`,
 * to an admin against anybody.
 *
 * Clamped in the service rather than the route, because the page and the route
 * are two callers of one function and a rule applied to one of them is the
 * shape of defect this repository keeps producing.
 */

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn() }))

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/env', () => ({ env: { NEXTAUTH_URL: 'https://app.test', BLOB_READ_WRITE_TOKEN: 't' } }))
vi.mock('@vercel/blob', () => ({ put: vi.fn(), head: vi.fn(), del: vi.fn() }))
// The storage provider and the PDF renderers are pulled in by report.service
// and build a client at module load. None of them is exercised here.
vi.mock('@/integrations/storage', () => ({ storageProvider: { upload: vi.fn(), getUrl: vi.fn() } }))
vi.mock('@/lib/pdf/statement', () => ({ renderStatementPDF: vi.fn() }))
vi.mock('@/lib/pdf/contribution-report', () => ({ renderContributionReportPDF: vi.fn() }))
vi.mock('@/lib/encryption', () => ({ maskStoredSecret: vi.fn(() => '****') }))
vi.mock('@xxm/observability', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/repositories/transaction.repository', () => ({
  transactionRepo: { findMany: mocks.findMany, count: mocks.count },
  SUCCESSFUL_INFLOW: {},
}))

import { getTransactionHistory } from '@/services/report.service'

/** The options object the repository was actually called with. */
const opts = () => mocks.findMany.mock.calls[0][1] as { skip: number; take: number }
const where = () => mocks.findMany.mock.calls[0][0] as Record<string, unknown>

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findMany.mockResolvedValue([])
  mocks.count.mockResolvedValue(0)
})

async function history(filter: Record<string, unknown>) {
  return getTransactionHistory('user-1', 'user-1', [], filter as never)
}

describe('how many rows a caller may ask for', () => {
  it('caps an enormous limit rather than fetching it', async () => {
    await history({ page: 1, limit: 1_000_000 })
    expect(opts().take).toBe(100)
  })

  it('refuses a zero or negative limit', async () => {
    await history({ page: 1, limit: 0 })
    expect(opts().take).toBe(1)
  })

  it('falls back to twenty when the limit is not a number', async () => {
    await history({ page: 1, limit: Number('abc') })
    expect(opts().take).toBe(20)
  })
})

describe('which page a caller may ask for', () => {
  it('never sends NaN to the database', async () => {
    // `?page=abc` produced `skip: NaN`, which Prisma rejects at the driver — a
    // 500 for a member who mistyped a URL.
    await history({ page: Number('abc'), limit: 20 })
    expect(opts().skip).toBe(0)
  })

  it('never sends a negative skip', async () => {
    await history({ page: -5, limit: 20 })
    expect(opts().skip).toBe(0)
  })

  it('floors a fractional page', async () => {
    await history({ page: 2.7, limit: 20 })
    expect(opts().skip).toBe(20)
  })
})

describe('which filters are believed', () => {
  it('drops a status that is not one of the five', async () => {
    // An unknown value reached Prisma as an invalid enum and threw.
    await history({ page: 1, limit: 20, status: 'nonsense' })
    expect(where().status).toBeUndefined()
  })

  it('keeps a status that is', async () => {
    await history({ page: 1, limit: 20, status: 'FAILED' })
    expect(where().status).toBe('FAILED')
  })

  it('drops a type that is not one of the four', async () => {
    await history({ page: 1, limit: 20, type: 'DROP TABLE' })
    expect(where().type).toBeUndefined()
  })

  it('keeps a type that is', async () => {
    await history({ page: 1, limit: 20, type: 'MANUAL' })
    expect(where().type).toBe('MANUAL')
  })
})

describe('dates that cannot be parsed', () => {
  it('ignores an unparseable from-date rather than passing an Invalid Date', async () => {
    // `new Date('garbage')` is an Invalid Date, which Prisma rejects. A filter
    // nobody can parse is no filter, not an error.
    await history({ page: 1, limit: 20, from: 'garbage' })
    expect(where().createdAt).toBeUndefined()
  })

  it('keeps a real date range', async () => {
    await history({ page: 1, limit: 20, from: '2026-01-01', to: '2026-01-31' })
    const range = where().createdAt as { gte: Date; lte: Date }
    expect(range.gte).toBeInstanceOf(Date)
    expect(range.lte).toBeInstanceOf(Date)
  })
})

describe('the scoping that was already right', () => {
  it('always constrains to the member whose history was asked for', async () => {
    await history({ page: 1, limit: 20 })
    expect(where().contribution).toEqual({ userId: 'user-1' })
  })
})
