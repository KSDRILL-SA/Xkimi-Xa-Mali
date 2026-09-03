import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Releasing a month, and recording money that arrived another way.
 *
 * Both are stated in the Founder Guide as powers leadership holds, and until
 * now neither existed. `WAIVED` was read by statements, member insights, the
 * collection-rate report and badge scoring — and written by nothing, so no
 * contribution could ever reach it. A cash payment had nowhere to go at all.
 *
 * Waiving still happens here, and the rules below are the ones that keep it
 * from becoming a way to lose money quietly: a reason that is actually a
 * reason, and a version check so it cannot land on a contribution that moved
 * while the admin was reading it.
 *
 * Recording a payment no longer happens here. It writes through
 * `recordOfflineContribution` in the web app, and the reason is the whole
 * point of the change: this console's version required an active debit-order
 * mandate, required the month to already exist, and typed the row MANUAL —
 * three refusals that made it useless for the members it was meant for, who
 * have no mandate because Netcash declined the DebiCheck application. So what
 * is tested here is what this side is still responsible for: resolving the
 * member and period, forwarding faithfully, and putting the other app's
 * refusal in front of the person who filled in the form rather than swallowing
 * it. The money rules themselves are tested where they live, in the web app's
 * offline-payment suite.
 */

const mocks = vi.hoisted(() => ({
  findContribution: vi.fn(),
  updateMany: vi.fn(),
  findMandate: vi.fn(),
  createTx: vi.fn(),
  transaction: vi.fn(),
  inbox: vi.fn(),
  audit: vi.fn(),
  post: vi.fn(),
  findUser: vi.fn(),
}))

vi.mock('@xxm/observability', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/db', () => ({
  Prisma: {},
  db: {
    contribution: { findUnique: mocks.findContribution, updateMany: mocks.updateMany },
    user: { findUnique: mocks.findUser },
    paymentMandate: { findFirst: mocks.findMandate },
    $transaction: mocks.transaction,
  },
}))
vi.mock('@/lib/services/shared', async (orig) => {
  const actual = await orig<typeof import('@/lib/services/shared')>()
  return { ...actual, notifyInbox: mocks.inbox, writeAuditLog: mocks.audit }
})
vi.mock('@/lib/api', () => ({ internalAdminPost: mocks.post }))

import {
  waiveContribution, recordPayment, recordOfflinePaymentForMember,
} from '@/lib/services/contributions'

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
  mocks.findUser.mockResolvedValue({ firstName: 'Kurhula', lastName: 'Maluleke' })
  // The real $transaction hands a client to the callback; the callback is what
  // is being tested, so it runs against the same mocked tables.
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ contribution: { updateMany: mocks.updateMany }, transaction: { create: mocks.createTx } }),
  )
  mocks.post.mockResolvedValue({
    ok: true,
    status: 201,
    data: {
      transactionId: 'tx-1', contributionId: 'c1', receiptRef: 'XXM-OFF-ABCD1234',
      period: 'August 2026', amount: 40, amountDue: 100, amountPaid: 40,
      outstanding: 60, status: 'PARTIAL', overpaid: false,
    },
  })
})

/** The body of the single call the service made. */
const posted = () => mocks.post.mock.calls[0]![1] as Record<string, unknown>

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
  it('sends it to the one service that writes offline payments', async () => {
    await recordPayment('admin-1', ADMIN, 'c1', 40, 'Cash at the August meeting')

    expect(mocks.post).toHaveBeenCalledWith(
      '/api/v1/admin/contributions/offline',
      expect.any(Object),
      expect.objectContaining({ adminUserId: 'admin-1' }),
    )
    // Nothing written from this side. Two code paths writing transaction rows
    // that disagree about type and mandate is the drift this replaced.
    expect(mocks.createTx).not.toHaveBeenCalled()
    expect(mocks.updateMany).not.toHaveBeenCalled()
  })

  it('resolves the member and period from the contribution it was given', async () => {
    // The form on the row knows a contribution id and nothing else; the service
    // it now calls is addressed by member and month.
    await recordPayment('admin-1', ADMIN, 'c1', 40, 'Cash at the August meeting')

    expect(posted()).toMatchObject({
      userId: 'u1', periodMonth: 8, periodYear: 2026,
      amount: 40, reference: 'Cash at the August meeting',
    })
  })

  it('sends the date the money arrived when it is given', async () => {
    // The backlog is months old. Stamping these with the moment they were
    // captured would put three months of payments on one afternoon.
    await recordPayment('admin-1', ADMIN, 'c1', 40, 'EFT 8231', undefined, new Date('2026-06-15T12:00:00Z'))

    expect(posted()['receivedAt']).toBe('2026-06-15T12:00:00.000Z')
  })

  it('defaults the date to now, for a payment recorded as it happens', async () => {
    const before = Date.now()
    await recordPayment('admin-1', ADMIN, 'c1', 40, 'Cash')

    const sent = new Date(posted()['receivedAt'] as string).getTime()
    expect(sent).toBeGreaterThanOrEqual(before)
    expect(sent).toBeLessThanOrEqual(Date.now())
  })

  it('gives the page back what it needs to report the outcome', async () => {
    // The page redirects with these. `outstanding` and `overpaid` are the two
    // the old return had no way to express, and they are what the banner uses
    // to tell an admin they have just recorded more than was owed.
    const res = await recordPayment('admin-1', ADMIN, 'c1', 40, 'Cash')

    expect(res).toMatchObject({
      id: 'c1', amount: 40, period: 'August 2026',
      settled: false, outstanding: 60, overpaid: false,
      // Resolved here rather than posted by the form: the catch-up form knows
      // only the id it submitted, and that is the form where naming the member
      // back matters most.
      memberName: 'Kurhula Maluleke',
    })
  })

  it('calls a month settled only when the other app says PAID', async () => {
    // Derived from the returned status rather than recomputed here. Working it
    // out separately is how two views of the same money start disagreeing.
    mocks.post.mockResolvedValue({
      ok: true, status: 201,
      data: {
        transactionId: 'tx-1', contributionId: 'c1', receiptRef: 'r',
        period: 'August 2026', amount: 100, amountDue: 100, amountPaid: 100,
        outstanding: 0, status: 'PAID', overpaid: false,
      },
    })

    await expect(recordPayment('admin-1', ADMIN, 'c1', 100, 'Full amount by transfer'))
      .resolves.toMatchObject({ settled: true, outstanding: 0 })
  })

  it('reports an overpayment rather than hiding it', async () => {
    // Deliberately not refused any more. Nobody knows what a member with no
    // debit order owes, and turning away a deposit already in the account does
    // not un-receive it — so it is recorded, and the admin is told.
    mocks.post.mockResolvedValue({
      ok: true, status: 201,
      data: {
        transactionId: 'tx-1', contributionId: 'c1', receiptRef: 'r',
        period: 'August 2026', amount: 150, amountDue: 100, amountPaid: 150,
        outstanding: -50, status: 'PAID', overpaid: true,
      },
    })

    await expect(recordPayment('admin-1', ADMIN, 'c1', 150, 'Deposit 44'))
      .resolves.toMatchObject({ overpaid: true, outstanding: -50 })
  })

  it('puts the other app\'s refusal in front of the admin, word for word', async () => {
    // That message names the field that is wrong — which period is out of
    // range, which reference is already recorded. Replacing it with "that did
    // not go through" throws away the only part that says what to do next.
    mocks.post.mockResolvedValue({
      ok: false, status: 409, data: null,
      error: { code: 'CTR_007', message: 'A payment with reference "EFT 8231" is already recorded for this member and period' },
    })

    await expect(recordPayment('admin-1', ADMIN, 'c1', 40, 'EFT 8231'))
      .rejects.toThrow(/already recorded for this member and period/)
  })

  it('refuses a contribution that does not exist', async () => {
    mocks.findContribution.mockResolvedValue(null)

    await expect(recordPayment('admin-1', ADMIN, 'c1', 40, 'Cash')).rejects.toThrow(/not found/i)
    expect(mocks.post).not.toHaveBeenCalled()
  })

  it('refuses a member who does not exist, before sending anything', async () => {
    mocks.findUser.mockResolvedValue(null)

    await expect(recordPayment('admin-1', ADMIN, 'c1', 40, 'Cash')).rejects.toThrow(/not found/i)
    expect(mocks.post).not.toHaveBeenCalled()
  })
})

describe('recording against a month that has no row yet', () => {
  // The backlog case, and the reason the console needed a second entry point.
  // Contributions are only generated for members with an active debit order,
  // so June to August for the members paying by EFT are not on the page to be
  // clicked. This one names the member and the month directly.
  const backlog = {
    adminId: 'admin-1', adminRoles: ADMIN,
    userId: 'u1', amount: 200, periodMonth: 6, periodYear: 2026,
    reference: 'EFT 8231', receivedAt: new Date('2026-06-15T12:00:00Z'),
  }

  it('needs no contribution to exist, and never looks for one', async () => {
    await recordOfflinePaymentForMember(backlog)

    expect(mocks.findContribution).not.toHaveBeenCalled()
    expect(posted()).toMatchObject({ userId: 'u1', periodMonth: 6, periodYear: 2026, amount: 200 })
  })

  it('passes on what the member owed, when the admin says', async () => {
    // The field that stops a part payment reading as settled. A member with no
    // mandate has no recorded obligation, so without this the month is created
    // owing exactly what arrived and R200 against a R500 month marks them up
    // to date.
    await recordOfflinePaymentForMember({ ...backlog, amountDue: 500 })

    expect(posted()['amountDue']).toBe(500)
  })

  it('omits the amount owed entirely when it was left blank', async () => {
    // Absent and zero mean different things to the service: absent is "nothing
    // to go on, fall back", zero would be a stated obligation of nothing.
    await recordOfflinePaymentForMember(backlog)

    expect(posted()).not.toHaveProperty('amountDue')
    expect(posted()).not.toHaveProperty('note')
  })

  it('carries the note through when there is one', async () => {
    await recordOfflinePaymentForMember({ ...backlog, note: 'Handed over at the June meeting' })

    expect(posted()['note']).toBe('Handed over at the June meeting')
  })
})

describe('who may do either', () => {
  it('refuses somebody without the admin role', async () => {
    await expect(waiveContribution('u9', ['MEMBER'], 'c1', 'A perfectly good reason')).rejects.toThrow()
    await expect(recordPayment('u9', ['MEMBER'], 'c1', 40, 'Cash')).rejects.toThrow()
    await expect(recordOfflinePaymentForMember({
      adminId: 'u9', adminRoles: ['MEMBER'], userId: 'u1', amount: 40,
      periodMonth: 6, periodYear: 2026, reference: 'Cash', receivedAt: new Date(),
    })).rejects.toThrow()

    expect(mocks.updateMany).not.toHaveBeenCalled()
    // Checked here as well as at the far end. The web route re-checks, but a
    // console that forwards anything a non-admin submits is one misconfigured
    // shared secret away from being the hole.
    expect(mocks.post).not.toHaveBeenCalled()
  })
})
