import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Whether an alert actually reaches a person — in-app, and only in-app.
 *
 * Every alert this system raised used to end at `notifyAdmins`, which writes
 * an in-app inbox message and stops. It then grew an email leg, and briefly a
 * standing-address email fallback, on the theory that a page nobody opens is
 * the same as silence. That grew its own failure: a queued channel can sit
 * around and fire later than the thing it describes is still true — which is
 * exactly what happened when a batch of stale `admin-alert-sms` rows, stuck
 * since before SMS was dropped from this alert, got revived by an unrelated
 * fix and arrived days late, alongside a current `admin-alert-email` for the
 * same code. By owner decision, operational alerts are in-app only now — no
 * SMS, no email, for any severity. What is tested here is that the inbox
 * write happens, reaches every active admin, and that nothing else is queued.
 */

const mocks = vi.hoisted(() => ({
  findAdmins: vi.fn(),
  notifyAdmins: vi.fn(),
  writeAuditLog: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: { user: { findMany: mocks.findAdmins } } }))
vi.mock('@/services/inbox.service', () => ({ notifyAdmins: mocks.notifyAdmins }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: mocks.loggerWarn, error: mocks.loggerError },
}))

import { raiseOperationalAlert } from '@/services/alert.service'

const CRITICAL = {
  code: 'DEBIT_RUN_INCOMPLETE',
  severity: 'critical' as const,
  title: '2026-08: 9 contributions not collected',
  body: '9 declined by the bank',
}

const WARNING = { ...CRITICAL, code: 'FINANCIAL_ANOMALY_DETECTED', severity: 'warning' as const }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findAdmins.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }])
  mocks.notifyAdmins.mockResolvedValue(2)
  mocks.writeAuditLog.mockResolvedValue(undefined)
})

describe('how far an alert travels', () => {
  it('writes a critical one to the inbox, and reports so', async () => {
    const result = await raiseOperationalAlert(CRITICAL)

    expect(mocks.notifyAdmins).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ admins: 2, inbox: true })
  })

  it('reaches the inbox the same way for a warning — severity changes the wording, not the travel', async () => {
    const result = await raiseOperationalAlert(WARNING)

    expect(mocks.notifyAdmins).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ inbox: true })
  })

  it('never queues anything — SMS or email — whatever the severity', async () => {
    // This is the alert most likely to fire *because* a channel is failing
    // (NOTIFICATIONS_ABANDONED). A queued channel can also sit and arrive
    // late — days after the thing it describes is still true — which is
    // exactly what happened once. In-app only, unconditionally.
    await raiseOperationalAlert(CRITICAL)
    await raiseOperationalAlert(WARNING)

    expect(mocks.notifyAdmins).toHaveBeenCalledTimes(2)
  })

  it('reaches only admins who are still active', async () => {
    await raiseOperationalAlert(CRITICAL)

    // A suspended founder is not an escalation path. The filter is the query's,
    // so this pins the query rather than re-implementing it.
    expect(mocks.findAdmins).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'ACTIVE' }),
      }),
    )
  })
})

describe('what the inbox is given', () => {
  it('marks a critical row differently from a warning', async () => {
    await raiseOperationalAlert(CRITICAL)
    expect(mocks.notifyAdmins.mock.calls[0][0].title).toContain('🔴')

    vi.clearAllMocks()
    mocks.findAdmins.mockResolvedValue([{ id: 'admin-1' }])
    mocks.notifyAdmins.mockResolvedValue(1)
    await raiseOperationalAlert(WARNING)
    expect(mocks.notifyAdmins.mock.calls[0][0].title).toContain('⚠️')
  })

  it('files the alert in the audit log under its own code', async () => {
    await raiseOperationalAlert({ ...CRITICAL, entityId: '2026-08', payload: { declined: 9 } })

    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DEBIT_RUN_INCOMPLETE',
        entity: 'System',
        entityId: '2026-08',
        payload: expect.objectContaining({ severity: 'critical', declined: 9 }),
      }),
    )
  })

  it('logs a critical alert at error level, so it reaches Sentry', async () => {
    // The one channel that does not depend on the database being readable.
    // When the notification worker itself is the thing that failed, this is
    // the only thing that leaves the building.
    await raiseOperationalAlert(CRITICAL)
    expect(mocks.loggerError).toHaveBeenCalled()
    expect(mocks.loggerWarn).not.toHaveBeenCalled()

    vi.clearAllMocks()
    mocks.findAdmins.mockResolvedValue([{ id: 'admin-1' }])
    await raiseOperationalAlert(WARNING)
    expect(mocks.loggerWarn).toHaveBeenCalled()
  })
})

describe('a channel that fails does not silence the rest', () => {
  it('reports the inbox failure without throwing', async () => {
    mocks.notifyAdmins.mockRejectedValue(new Error('inbox table locked'))

    const result = await raiseOperationalAlert(CRITICAL)

    expect(result.inbox).toBe(false)
  })

  it('never throws, whatever fails', async () => {
    // An alert is raised because something already went wrong. A failure to
    // deliver it must not become a second failure that takes down the job
    // reporting the first.
    mocks.findAdmins.mockRejectedValue(new Error('db down'))
    mocks.notifyAdmins.mockRejectedValue(new Error('db down'))
    mocks.writeAuditLog.mockRejectedValue(new Error('db down'))

    await expect(raiseOperationalAlert(CRITICAL)).resolves.toMatchObject({
      admins: 0,
      inbox: false,
    })
    // And it is still on the record, because the log line does not touch the database.
    expect(mocks.loggerError).toHaveBeenCalled()
  })
})

describe('nobody to tell', () => {
  it('says so loudly rather than reporting success', async () => {
    mocks.findAdmins.mockResolvedValue([])

    const result = await raiseOperationalAlert(CRITICAL)

    expect(result.admins).toBe(0)
    // An alerting system with no recipients looks exactly like a quiet night
    // from the outside. This is the line that tells the two apart.
    expect(
      mocks.loggerError.mock.calls.some(([msg]) => /no active admin/i.test(String(msg))),
    ).toBe(true)
  })
})
