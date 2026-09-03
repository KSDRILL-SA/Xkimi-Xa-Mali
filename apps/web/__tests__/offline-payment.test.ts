import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Recording money that reached the bank account without the gateway.
 *
 * Netcash declined the DebiCheck application — their processing bank requires
 * an active debit-order base a new stokvel cannot have — while members had been
 * paying by EFT for months. This is the path that lets those payments exist in
 * the system at all.
 *
 * The case these guard hardest is a member with NO mandate, because that is who
 * the feature is for. Nothing in the system knows what such a member owes, so
 * what a period is created owing is a decision rather than a lookup, and the
 * wrong default silently marks people up to date who are not.
 */

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  findMandate: vi.fn(),
  findByPeriod: vi.fn(),
  contribCreate: vi.fn(),
  txCreate: vi.fn(),
  findByKey: vi.fn(),
  runTransaction: vi.fn(),
  recalculate: vi.fn(),
  writeAuditLog: vi.fn(),
  findById: vi.fn(),
  inbox: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: { ENABLE_MANUAL_PAYMENTS: true } }))
vi.mock('@/lib/db', () => ({ db: { user: { findUnique: mocks.findUser } } }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/services/budget.service', () => ({ checkBudget: vi.fn(), recordBudgetOverride: vi.fn() }))
vi.mock('@/services/goal.service', () => ({ syncPrimaryGoalProgress: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/ledger.service', () => ({
  postPoolCredit: vi.fn().mockResolvedValue(undefined),
  postPoolDebit: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/services/notification.service', () => ({ queueNotification: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/inbox.service', () => ({ createInboxMessages: mocks.inbox }))
vi.mock('@/lib/cache', () => ({
  cache: { del: vi.fn().mockResolvedValue(undefined), get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined) },
  CACHE_KEYS: { DASHBOARD_STATS: 'k', memberInsights: (id: string) => 'insights:' + id, contributionSummary: (id: string) => 'summary:' + id },
}))
vi.mock('@/lib/inngest', () => ({ inngest: { send: vi.fn().mockResolvedValue(undefined) }, InngestEvents: {} }))
vi.mock('@xxm/observability', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/integrations/payment', () => ({ paymentGateway: {} }))
vi.mock('@/repositories/mandate.repository', () => ({
  mandateRepo: { findFirst: mocks.findMandate, findActiveByUser: vi.fn() },
}))
vi.mock('@/repositories/budget.repository', () => ({ budgetRepo: { findActiveByType: vi.fn() } }))
vi.mock('@/repositories/transaction.repository', () => ({
  transactionRepo: {
    create: mocks.txCreate,
    findByIdempotencyKey: mocks.findByKey,
    aggregate: vi.fn().mockResolvedValue({ _sum: { amount: 0 } }),
  },
  SUCCESSFUL_INFLOW: {},
}))
vi.mock('@/repositories/contribution.repository', () => ({
  contributionRepo: {
    findByPeriod: mocks.findByPeriod,
    create: mocks.contribCreate,
    findById: mocks.findById,
    update: vi.fn(),
    updateByVersion: vi.fn().mockResolvedValue({ count: 1 }),
    findUniqueWithVersion: vi.fn().mockResolvedValue({
      id: 'contrib-1', amountDue: 500, amountPaid: 0, dueDate: new Date(), version: 1, status: 'PENDING',
    }),
  },
  runTransaction: mocks.runTransaction,
}))

import { recordOfflineContribution } from '@/services/contribution.service'

const ADMIN = 'admin-1'
const ROLES = ['ADMIN']

const payment = (over: Record<string, unknown> = {}) => ({
  userId: 'member-1',
  amount: 200,
  periodMonth: 6,
  periodYear: 2026,
  receivedAt: new Date('2026-06-15'),
  reference: 'EFT 8231',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findUser.mockResolvedValue({ id: 'member-1', status: 'ACTIVE', firstName: 'Kurhula' })
  mocks.findMandate.mockResolvedValue(null)
  mocks.findByPeriod.mockResolvedValue(null)
  mocks.contribCreate.mockImplementation(async (data: object) => ({ id: 'contrib-1', ...data }))
  mocks.findByKey.mockResolvedValue(null)
  mocks.runTransaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) =>
    fn({ contribution: { update: vi.fn() } }),
  )
  mocks.txCreate.mockImplementation(async (data: object) => ({ id: 'tx-1', ...data }))
  // How the period reads once the payment is on it. Read back from the
  // repository rather than computed, so the tests exercise the same source the
  // service reports from.
  mocks.findById.mockResolvedValue({ id: 'contrib-1', amountDue: 500, amountPaid: 200, status: 'PARTIAL' })
  mocks.inbox.mockResolvedValue(undefined)
})

describe('what a period is created owing', () => {
  it('uses the amount the admin states, not the amount received', async () => {
    // The bug this exists for. A member with no mandate has no recorded
    // obligation, so without an explicit figure the period is created owing
    // exactly what arrived — and a part payment settles it in full. Somebody
    // who owed R500 and paid R200 would be marked up to date.
    await recordOfflineContribution(
      payment({ amount: 200, amountDue: 500 }) as never,
      ADMIN,
      ROLES,
    )

    expect(mocks.contribCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amountDue: 500, amountPaid: 0 }),
    )
  })

  it('prefers the mandate over anything the admin states', async () => {
    // Where a mandate exists the obligation is already agreed. An admin
    // recording a payment has no business restating what somebody signed up to,
    // so the mandate wins even when a different figure is supplied.
    mocks.findMandate.mockResolvedValue({ id: 'm-1', amount: 750, debitDay: 25 })

    await recordOfflineContribution(
      payment({ amount: 200, amountDue: 500 }) as never,
      ADMIN,
      ROLES,
    )

    expect(mocks.contribCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amountDue: 750 }),
    )
  })

  it('falls back to the amount received when there is nothing else to go on', async () => {
    // Last resort, and only when the admin did not say. Documented rather than
    // silent: this is the case that settles the period in full.
    await recordOfflineContribution(payment({ amount: 200 }) as never, ADMIN, ROLES)

    expect(mocks.contribCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amountDue: 200 }),
    )
  })

  it('leaves an existing period amountDue alone', async () => {
    // Recording a payment must never restate an obligation that already exists.
    mocks.findByPeriod.mockResolvedValue({ id: 'contrib-1', status: 'PENDING', amountDue: 500, amountPaid: 0 })

    await recordOfflineContribution(
      payment({ amount: 200, amountDue: 999 }) as never,
      ADMIN,
      ROLES,
    )

    expect(mocks.contribCreate).not.toHaveBeenCalled()
  })
})

describe('the transaction it writes', () => {
  it('carries no mandate and is typed OFFLINE', async () => {
    await recordOfflineContribution(payment() as never, ADMIN, ROLES)

    const [written] = mocks.txCreate.mock.calls[0]
    // OFFLINE rather than MANUAL: MANUAL means the member pressed pay and it
    // went to the gateway. Conflating them would leave nobody able to tell
    // which rows ever touched a provider.
    expect(written.type).toBe('OFFLINE')
    // Null rather than a placeholder — faking a mandate would need a fake bank
    // account beneath it.
    expect(written.mandateId).toBeNull()
  })

  it('is SUCCESS on write, because the money is already in the account', async () => {
    // There is no webhook coming to confirm this. Anything else would leave the
    // row waiting forever for a settlement that already happened.
    await recordOfflineContribution(payment() as never, ADMIN, ROLES)

    expect(mocks.txCreate.mock.calls[0][0].status).toBe('SUCCESS')
  })

  it('records the bank reference and who asserted it', async () => {
    // A gateway payment is self-evidencing. An offline row is one person's
    // claim that money arrived, and these two fields are what let somebody
    // check it against the statement later.
    await recordOfflineContribution(payment() as never, ADMIN, ROLES)

    const [written] = mocks.txCreate.mock.calls[0]
    expect(written.offlineReference).toBe('EFT 8231')
    expect(written.recordedById).toBe(ADMIN)
  })

  it('dates the payment when the money arrived, not when it was captured', async () => {
    // The backlog is months old. Stamping these with "now" would put three
    // months of payments on one day and make every statement wrong.
    await recordOfflineContribution(
      payment({ receivedAt: new Date('2026-06-15') }) as never,
      ADMIN,
      ROLES,
    )

    expect(mocks.txCreate.mock.calls[0][0].processedAt).toEqual(new Date('2026-06-15'))
  })
})

describe('refusals', () => {
  it('will not record the same bank reference twice for a period', async () => {
    // Two admins capturing the same statement line, or one double-submitted
    // form, would otherwise double the member's paid balance and settle a
    // period that is not.
    mocks.findByKey.mockResolvedValue({ id: 'tx-existing' })

    await expect(
      recordOfflineContribution(payment() as never, ADMIN, ROLES),
    ).rejects.toThrow(/already recorded/i)

    expect(mocks.txCreate).not.toHaveBeenCalled()
  })

  it('refuses a caller who is not an admin', async () => {
    await expect(
      recordOfflineContribution(payment() as never, 'member-9', ['MEMBER']),
    ).rejects.toThrow()

    expect(mocks.txCreate).not.toHaveBeenCalled()
  })

  it('refuses a member who does not exist', async () => {
    mocks.findUser.mockResolvedValue(null)

    await expect(
      recordOfflineContribution(payment() as never, ADMIN, ROLES),
    ).rejects.toThrow()
  })

  it('records for a resigned member, on purpose', async () => {
    // Money that arrived is a fact about the past, and settling up with
    // somebody on their way out is the commonest reason to record a late
    // payment. Refusing would leave real money unrecordable for exactly the
    // members most likely to need the record.
    mocks.findUser.mockResolvedValue({ id: 'member-1', status: 'RESIGNED', firstName: 'Kurhula' })

    await expect(
      recordOfflineContribution(payment() as never, ADMIN, ROLES),
    ).resolves.toMatchObject({ transactionId: 'tx-1' })
  })
})

describe('what it reports back', () => {
  it('says what is still outstanding, so a part payment cannot read as settled', async () => {
    // The console redirects with this and the banner prints it. Without it an
    // admin recording R200 of a R500 month sees "payment recorded" and no
    // indication that R300 is still owed.
    const res = await recordOfflineContribution(
      payment({ amount: 200, amountDue: 500 }) as never,
      ADMIN,
      ROLES,
    )

    expect(res).toMatchObject({
      period: 'June 2026',
      amount: 200,
      amountDue: 500,
      amountPaid: 200,
      outstanding: 300,
      status: 'PARTIAL',
      overpaid: false,
    })
  })

  it('flags an overpayment rather than refusing it', async () => {
    // Deliberately recorded, not blocked. Nobody knows what a member with no
    // mandate owes, and turning away a deposit that is already in the bank
    // account does not un-receive the money — it leaves it unrecorded. So it is
    // written and reported, and a person decides whether to reverse it.
    mocks.findById.mockResolvedValue({ id: 'contrib-1', amountDue: 500, amountPaid: 700, status: 'PAID' })

    const res = await recordOfflineContribution(
      payment({ amount: 700, amountDue: 500 }) as never,
      ADMIN,
      ROLES,
    )

    expect(res.overpaid).toBe(true)
    expect(res.outstanding).toBe(-200)
  })

  it('tells the member money was recorded against their name', async () => {
    // Leadership changing somebody\'s financial record without them being part
    // of it is exactly the thing that must not happen quietly.
    await recordOfflineContribution(
      payment({ amount: 200, amountDue: 500 }) as never,
      ADMIN,
      ROLES,
    )

    expect(mocks.inbox).toHaveBeenCalledWith(
      ['member-1'],
      expect.objectContaining({
        title: expect.stringContaining('June 2026'),
        body: expect.stringContaining('R300.00 is still outstanding'),
      }),
    )
  })

  it('records the payment even when telling the member fails', async () => {
    // The money is already committed by this point. A failed inbox write must
    // not surface as an error the admin retries, or the same payment gets
    // recorded twice.
    mocks.inbox.mockRejectedValue(new Error('inbox down'))

    await expect(recordOfflineContribution(payment() as never, ADMIN, ROLES))
      .resolves.toMatchObject({ transactionId: 'tx-1' })
  })
})

describe('a month that was waived', () => {
  it('refuses the payment and says why', async () => {
    // A waiver is a decision leadership made — that this member owes nothing
    // for this month. Recording a payment against it would quietly undo that
    // decision instead of asking anybody to revisit it.
    //
    // Enforced here rather than in the admin console, which is where it used to
    // live: this service is now the only way an offline payment is written, and
    // a rule enforced by one of two callers is a rule that is not enforced.
    mocks.findByPeriod.mockResolvedValue({ id: 'contrib-1', status: 'WAIVED', amountDue: 500, amountPaid: 0 })

    await expect(recordOfflineContribution(payment() as never, ADMIN, ROLES))
      .rejects.toThrow(/waived/i)

    expect(mocks.txCreate).not.toHaveBeenCalled()
  })
})
