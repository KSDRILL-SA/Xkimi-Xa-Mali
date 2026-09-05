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
  redisDel: vi.fn(),
  submitScheduledDebit: vi.fn(),
  queueNotification: vi.fn(),
  notifyAdmins: vi.fn(),
  writeAuditLog: vi.fn(),
  raiseAlert: vi.fn(),
  loggerError: vi.fn(),
  heartbeatUpsert: vi.fn(),
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
    // Named explicitly rather than left off. `recordJobHeartbeat` swallows its
    // own failures on purpose — it is called after money has moved and must not
    // fail the run that moved it — so an unmocked table here would throw, be
    // caught, and let every assertion below pass while the heartbeat was never
    // written at all.
    jobHeartbeat: { upsert: mocks.heartbeatUpsert },
  },
}))
vi.mock('@/lib/redis', () => ({ redis: { get: mocks.redisGet, set: mocks.redisSet, del: mocks.redisDel } }))
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
vi.mock('@/services/alert.service', () => ({ raiseOperationalAlert: mocks.raiseAlert }))
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
    user: { id: `user-${id}`, status: 'ACTIVE', firstName: 'Kurhula' },
  }
}

const slugsSent = () => mocks.queueNotification.mock.calls.map((c) => c[0].templateSlug)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.redisGet.mockResolvedValue(null)
  // SET NX: 'OK' when this run won the period, null when another already had it.
  mocks.redisSet.mockResolvedValue('OK')
  mocks.redisDel.mockResolvedValue(1)
  mocks.txFindUnique.mockResolvedValue(null)
  mocks.txCreate.mockImplementation(({ data }: never) => Promise.resolve({ id: 'tx-1', ...(data as object) }))
  mocks.contribFindUnique.mockResolvedValue(null)
  // amountDue/amountPaid are not decoration here. Both are NOT NULL columns —
  // a contribution without them cannot exist — and the run now collects the
  // outstanding balance (amountDue - amountPaid) rather than the full mandate
  // amount, so a fixture omitting them models a row the database would reject
  // and silently produces a zero balance, skipping every mandate. These are the
  // values the run's own upsert step writes for a fresh period: the mandate's
  // amount, nothing paid yet.
  mocks.contribCreate.mockResolvedValue({
    id: 'contrib-1',
    status: 'PENDING',
    amountDue: 500,
    amountPaid: 0,
  })
  mocks.queueNotification.mockResolvedValue(undefined)
  mocks.notifyAdmins.mockResolvedValue(1)
  mocks.raiseAlert.mockResolvedValue(undefined)
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

  it('records it as UNKNOWN, not FAILED — the bank may have taken the money', async () => {
    // The distinction this whole status exists for. An exhausted retry is a
    // timeout or an unreachable endpoint, not a decline: the submission may
    // well have landed.
    //
    // It used to be written FAILED, and `transaction-retry-failed` collects
    // exactly `status: 'FAILED'` — so a timeout on a debit the bank had
    // accepted went into the recovery pool and was submitted again.
    await executeDebitRun(step)

    const rows = mocks.txCreate.mock.calls.map((c) => c[0].data)

    expect(rows.filter((d: { status: string }) => d.status === 'FAILED')).toHaveLength(0)

    const unknown = rows.filter((d: { status: string }) => d.status === 'UNKNOWN')
    expect(unknown).toHaveLength(1)
    expect(unknown[0].mandateId).toBe('b')
    // A row still has to exist. Without one there is no trace at all, and the
    // mandate is not due again until next month.
    expect(unknown[0].failureReason).toContain('gateway unreachable')
  })

  it('marks it as infrastructure so the member is not judged for an outage', async () => {
    await executeDebitRun(step)

    const unknown = mocks.txCreate.mock.calls
      .map((c) => c[0].data)
      .find((d: { status: string }) => d.status === 'UNKNOWN')

    expect(unknown.failureReason.startsWith('INFRASTRUCTURE: ')).toBe(true)
  })

  it('tells leadership these are not being retried', async () => {
    // A decline retries itself; an unknown outcome must not. The alert has to
    // say which, or the reader assumes the usual recovery is under way.
    await executeDebitRun(step)

    const alert = mocks.raiseAlert.mock.calls.at(-1)?.[0] as { body: string }
    expect(alert.body.split(/\s+/).join(' ')).toMatch(/NOT being retried/i)
    expect(alert.body).toMatch(/debited twice/i)
  })

  it('does not tell the member their debit was declined — nothing was', async () => {
    await executeDebitRun(step)
    // The gateway was unreachable. Saying "declined" would be a false statement
    // about the member's bank account.
    expect(slugsSent()).not.toContain('payment-failed-sms')
    expect(slugsSent()).not.toContain('payment-failed-email')
  })

  it('still collects from every other mandate', async () => {
    const summary = await executeDebitRun(step)
    expect(summary.collected).toBe(2)
    expect(summary.infrastructure).toBe(1)
  })

  it('tells the admins money did not arrive', async () => {
    await executeDebitRun(step)

    expect(mocks.raiseAlert).toHaveBeenCalledOnce()
    const alert = mocks.raiseAlert.mock.calls[0][0]
    // Critical, so it leaves the inbox. This is the alert the runbook's P1 —
    // "money not moving on debit day, respond immediately" — depends on, and
    // until now it was filed in a web page nobody had a reason to open.
    expect(alert).toMatchObject({ code: 'DEBIT_RUN_INCOMPLETE', severity: 'critical' })
    expect(alert.payload).toMatchObject({ infrastructure: 1 })
  })

  it('keeps the alert title free of characters that cost an SMS segment', async () => {
    await executeDebitRun(step)

    // The title becomes the SMS body. One em dash or emoji forces UCS-2 and
    // cuts the segment from 160 characters to 70 — on the message that goes
    // out when money did not move.
    const { title } = mocks.raiseAlert.mock.calls[0][0]
    expect(title).toMatch(/^[\x20-\x7E]+$/)
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

  it('tells the member on both channels, using the mandatory templates', async () => {
    await executeDebitRun(step)

    // payment-failed-* are in MANDATORY_SLUGS. The debit-declined pair was not,
    // so a member with SMS switched off would never have heard about it.
    expect(slugsSent()).toEqual(['payment-failed-sms', 'payment-failed-email'])
    expect(mocks.queueNotification.mock.calls.map((c) => c[0].channel)).toEqual(['SMS', 'EMAIL'])
  })

  it('addresses the member by name and links to the page that can settle it', async () => {
    await executeDebitRun(step)

    const { payload } = mocks.queueNotification.mock.calls[0][0]
    // Unsupplied placeholders are not dropped — they reach the member as braces.
    expect(payload.firstName).toBe('Kurhula')
    expect(payload.url).toBe('https://app.example.test/dashboard/contribute')
    expect(payload.period).toBe('2026-08')
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
    expect(mocks.raiseAlert).not.toHaveBeenCalled()
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

  it('does not debit twice when another run already holds the period', async () => {
    // SET NX returns null to the loser. The claim IS the write now — the run
    // that used to read nothing, conclude the month was uncollected and submit
    // alongside its twin cannot get that far.
    mocks.findMandates.mockResolvedValue([mandate('a')])
    mocks.redisSet.mockResolvedValue(null)

    const summary = await executeDebitRun(step)

    expect(mocks.submitScheduledDebit).not.toHaveBeenCalled()
    expect(summary.skipped).toBe(1)
  })

  it('claims with NX rather than writing over whatever was there', async () => {
    mocks.findMandates.mockResolvedValue([mandate('a')])

    await executeDebitRun(step)

    expect(mocks.redisSet).toHaveBeenCalledWith(
      expect.stringContaining('debit:run:'),
      '1',
      expect.objectContaining({ nx: true }),
    )
  })

  it('skips a period the database already shows collected, even holding the claim', async () => {
    // Redis is a cache with a TTL. If the key lapsed — or Upstash was replaced
    // — the transaction row is the durable record that this month was already
    // taken, and it has to win.
    mocks.findMandates.mockResolvedValue([mandate('a')])
    mocks.txFindUnique.mockResolvedValue({ id: 'tx-old' })

    const summary = await executeDebitRun(step)

    expect(mocks.submitScheduledDebit).not.toHaveBeenCalled()
    expect(summary.skipped).toBe(1)
  })

  it('releases the claim it took when the database says no', async () => {
    // Otherwise a run that skips on a stale key leaves its own key behind and
    // locks out the next legitimate attempt for three days.
    mocks.findMandates.mockResolvedValue([mandate('a')])
    mocks.txFindUnique.mockResolvedValue({ id: 'tx-old' })

    await executeDebitRun(step)

    expect(mocks.redisDel).toHaveBeenCalledWith(expect.stringContaining('debit:run:'))
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

  it('collects only what is outstanding when part of the period is already paid', async () => {
    // The bug this covers: every amount in the run used to be the mandate's
    // monthly figure, whatever had already been paid against the period. A
    // member who settled R200 of a R500 month by EFT was still debited the
    // full R500 — R200 more than they owed, taken from their account.
    //
    // Unreachable while every payment came through the gateway. Recording cash
    // and EFT payments makes a part-paid period an ordinary mid-month state,
    // which is exactly what this used to get wrong.
    mocks.findMandates.mockResolvedValue([mandate('a')])
    mocks.contribFindUnique.mockResolvedValue({
      id: 'contrib-1',
      status: 'PARTIAL',
      amountDue: 500,
      amountPaid: 200,
    })
    mocks.submitScheduledDebit.mockResolvedValue({ status: 'SUCCESS', transactionRef: 'ref-a' })

    await executeDebitRun(step)

    // 300 outstanding, not the mandate's 500. Asserted on the gateway call
    // because that is the one that moves real money. `debitAmountWithFee` is
    // mocked to identity at the top of this file, so the figure here is the
    // base amount the run chose rather than the fee-adjusted total.
    expect(mocks.submitScheduledDebit).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 300 }),
    )
    // The recorded transaction has to agree with what was charged, or the
    // member's statement and their bank disagree about the same debit.
    expect(mocks.txCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 300 }) }),
    )
  })

  it('charges nothing when a part-payment already covered the whole period', async () => {
    // Balance closed to exactly zero without the status having caught up to
    // PAID. Submitting here would debit zero at best and the full amount at
    // worst, for a period that owes nothing.
    mocks.findMandates.mockResolvedValue([mandate('a')])
    mocks.contribFindUnique.mockResolvedValue({
      id: 'contrib-1',
      status: 'PARTIAL',
      amountDue: 500,
      amountPaid: 500,
    })

    const summary = await executeDebitRun(step)

    expect(mocks.submitScheduledDebit).not.toHaveBeenCalled()
    expect(summary.skipped).toBe(1)
  })

  it('still collects the full amount when nothing has been paid', async () => {
    // The ordinary case, kept honest: the outstanding-balance change must not
    // quietly alter what an untouched period collects.
    mocks.findMandates.mockResolvedValue([mandate('a')])
    mocks.contribFindUnique.mockResolvedValue({
      id: 'contrib-1',
      status: 'PENDING',
      amountDue: 500,
      amountPaid: 0,
    })
    mocks.submitScheduledDebit.mockResolvedValue({ status: 'SUCCESS', transactionRef: 'ref-a' })

    await executeDebitRun(step)

    expect(mocks.submitScheduledDebit).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 500 }),
    )
  })

  it('records a heartbeat, so a month in which it never runs is visible', async () => {
    // Without this the run leaves no trace of having happened at all. Every
    // alert the debit run can raise, it raises from inside itself — so the one
    // failure it cannot report is not being invoked, which is also the one that
    // means nobody is collected.
    mocks.findMandates.mockResolvedValue([mandate('a')])
    mocks.submitScheduledDebit.mockResolvedValue({ status: 'SUCCESS', transactionRef: 'ref-a' })

    await executeDebitRun(step)

    expect(mocks.heartbeatUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { jobId: 'debit-run' } }),
    )
  })

  it('still records a heartbeat on a night when every collection was declined', async () => {
    // The beat means "this run reached the end", not "this run went well".
    // Conflating the two would make a total failure of collection look exactly
    // like the job not running, and they need different responses.
    mocks.findMandates.mockResolvedValue([mandate('a')])
    mocks.submitScheduledDebit.mockResolvedValue({ status: 'FAILED', reason: 'insufficient funds' })

    const summary = await executeDebitRun(step)

    expect(summary.declined).toBe(1)
    expect(mocks.heartbeatUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { jobId: 'debit-run' } }),
    )
  })
})
