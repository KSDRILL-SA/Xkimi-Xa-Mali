import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Releasing a month, and recording money that arrived another way.
 *
 * Both are stated in the Founder Guide as powers leadership holds, and until
 * now neither existed. `WAIVED` was read by statements, member insights, the
 * collection-rate report and badge scoring — and written by nothing, so no
 * contribution could ever reach it. A cash payment had nowhere to go at all.
 *
 * The rules below are the ones that keep those two from becoming a way to lose
 * money quietly: a reason that is actually a reason, a refusal to take more
 * than is owed, and a version check so neither can land on a contribution that
 * moved while the admin was reading it.
 */

const mocks = vi.hoisted(() => ({
  findContribution: vi.fn(),
  updateMany: vi.fn(),
  findMandate: vi.fn(),
  createTx: vi.fn(),
  transaction: vi.fn(),
  inbox: vi.fn(),
  audit: vi.fn(),
}))

vi.mock('@xxm/observability', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/db', () => ({
  Prisma: {},
  db: {
    contribution: { findUnique: mocks.findContribution, updateMany: mocks.updateMany },
    paymentMandate: { findFirst: mocks.findMandate },
    $transaction: mocks.transaction,
  },
}))
vi.mock('@/lib/services/shared', async (orig) => {
  const actual = await orig<typeof import('@/lib/services/shared')>()
  return { ...actual, notifyInbox: mocks.inbox, writeAuditLog: mocks.audit }
})

import { waiveContribution, recordPayment } from '@/lib/services/contributions'

const ADMIN = ['ADMIN']
const PENDING = {
  id: 'c1', userId: 'u1', status: 'PENDING', version: 3,
  periodMonth: 8, periodYear: 2026, amountDue: 100, amountPaid: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findContribution.mockResolvedValue({ ...PENDING })
  mocks.updateMany.mockResolvedValue({ count: 1 })
  mocks.findMandate.mockResolvedValue({ id: 'm1' })
  // The real $transaction hands a client to the callback; the callback is what
  // is being tested, so it runs against the same mocked tables.
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ contribution: { updateMany: mocks.updateMany }, transaction: { create: mocks.createTx } }),
  )
})

describe('waiving a month', () => {
  it('releases it and says who did it and why', async () => {
    const res = await waiveContribution('admin-1', ADMIN, 'c1', 'Hospital bills this month, agreed at the meeting')

    expect(res.status).toBe('WAIVED')
    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1', version: 3 } }),
    )
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        action: 'ADMIN_CONTRIBUTION_WAIVED',
        payload: expect.objectContaining({ reason: expect.stringContaining('Hospital bills') }),
      }),
    )
  })

  it('tells the member, in the message, why', async () => {
    // A month that stops being owed without explanation is the sort of thing a
    // member notices later and cannot account for.
    await waiveContribution('admin-1', ADMIN, 'c1', 'Hospital bills this month, agreed at the meeting')

    expect(mocks.inbox).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        body: expect.stringContaining('Hospital bills'),
      }),
    )
  })

  it('refuses a reason that is not one', async () => {
    await expect(waiveContribution('admin-1', ADMIN, 'c1', 'ok')).rejects.toThrow(/at least 10 characters/i)
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it('refuses a month already settled in full', async () => {
    // Nothing to release, and waiving it would misreport a paid month as
    // forgiven on the member's statement.
    mocks.findContribution.mockResolvedValue({ ...PENDING, status: 'PAID', amountPaid: 100 })
    await expect(waiveContribution('admin-1', ADMIN, 'c1', 'A perfectly good reason here'))
      .rejects.toThrow(/settled in full/i)
  })

  it('refuses a month already waived', async () => {
    mocks.findContribution.mockResolvedValue({ ...PENDING, status: 'WAIVED' })
    await expect(waiveContribution('admin-1', ADMIN, 'c1', 'A perfectly good reason here'))
      .rejects.toThrow(/already been waived/i)
  })

  it('reports a race rather than silently doing nothing', async () => {
    // The collection job can settle this between the read and the write.
    // Waiving a month that has just been paid would erase the payment.
    mocks.updateMany.mockResolvedValue({ count: 0 })
    await expect(waiveContribution('admin-1', ADMIN, 'c1', 'A perfectly good reason here'))
      .rejects.toThrow(/just changed/i)
  })

  it('keeps what the member had already paid', async () => {
    // Waiving forgives the rest; it does not undo money already received.
    mocks.findContribution.mockResolvedValue({ ...PENDING, status: 'PARTIAL', amountPaid: 40 })
    await waiveContribution('admin-1', ADMIN, 'c1', 'A perfectly good reason here')

    const data = mocks.updateMany.mock.calls[0]![0].data
    expect(data).not.toHaveProperty('amountPaid')
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ amountPaid: 40 }) }),
    )
  })
})

describe('recording money that arrived another way', () => {
  it('records the amount and leaves the month partial', async () => {
    await recordPayment('admin-1', ADMIN, 'c1', 40, 'Cash at the August meeting')

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1', version: 3 },
        data: expect.objectContaining({ amountPaid: 40, status: 'PARTIAL' }),
      }),
    )
  })

  it('settles the month when the payment covers it', async () => {
    await recordPayment('admin-1', ADMIN, 'c1', 100, 'Full amount by transfer')

    expect(mocks.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) }),
    )
  })

  it('writes a transaction so the money can be traced', async () => {
    // A raised balance with no transaction behind it is a figure nobody can
    // account for later.
    await recordPayment('admin-1', ADMIN, 'c1', 40, 'Cash at the August meeting')

    expect(mocks.createTx).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contributionId: 'c1', amount: 40, type: 'MANUAL', status: 'SUCCESS',
          gatewayResponse: expect.objectContaining({ reference: 'Cash at the August meeting' }),
        }),
      }),
    )
  })

  it('refuses more than is outstanding, and says how much that is', async () => {
    mocks.findContribution.mockResolvedValue({ ...PENDING, status: 'PARTIAL', amountPaid: 60 })
    await expect(recordPayment('admin-1', ADMIN, 'c1', 50, 'Cash'))
      .rejects.toThrow(/R40\.00 is owed/)
    expect(mocks.createTx).not.toHaveBeenCalled()
  })

  it('refuses an amount that is not money', async () => {
    await expect(recordPayment('admin-1', ADMIN, 'c1', 0, 'Cash')).rejects.toThrow(/greater than zero/i)
    await expect(recordPayment('admin-1', ADMIN, 'c1', -20, 'Cash')).rejects.toThrow(/greater than zero/i)
  })

  it('refuses without a note saying how it arrived', async () => {
    // The only record that this money was cash at a meeting rather than a
    // mistake is whatever the admin types here.
    await expect(recordPayment('admin-1', ADMIN, 'c1', 40, '')).rejects.toThrow(/how the money arrived/i)
  })

  it('refuses against a month that was waived', async () => {
    mocks.findContribution.mockResolvedValue({ ...PENDING, status: 'WAIVED' })
    await expect(recordPayment('admin-1', ADMIN, 'c1', 40, 'Cash')).rejects.toThrow(/waived/i)
  })

  it('refuses a member with no active debit order', async () => {
    // The transaction has to hang off a mandate, and a member without one is
    // not somebody the Foundation is collecting from yet.
    mocks.findMandate.mockResolvedValue(null)
    await expect(recordPayment('admin-1', ADMIN, 'c1', 40, 'Cash')).rejects.toThrow(/no active debit order/i)
  })

  it('reports a race rather than double-counting', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 })
    await expect(recordPayment('admin-1', ADMIN, 'c1', 40, 'Cash at the meeting'))
      .rejects.toThrow(/just changed/i)
  })
})

describe('who may do either', () => {
  it('refuses somebody without the admin role', async () => {
    await expect(waiveContribution('u9', ['MEMBER'], 'c1', 'A perfectly good reason')).rejects.toThrow()
    await expect(recordPayment('u9', ['MEMBER'], 'c1', 40, 'Cash')).rejects.toThrow()
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })
})
