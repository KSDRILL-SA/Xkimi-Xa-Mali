import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Whether an alert actually reaches a person.
 *
 * Every alert this system raised used to end at `notifyAdmins`, which writes an
 * in-app inbox message and stops. The alert was raised; nobody was told. On
 * debit night that is the difference between the runbook's P1 — "money not
 * moving on debit day, respond immediately" — and finding out on Monday.
 *
 * So what is tested here is not the wording. It is the travel: which channels a
 * severity reaches, and that one channel failing does not take the others with
 * it.
 */

const mocks = vi.hoisted(() => ({
  findAdmins: vi.fn(),
  notifyAdmins: vi.fn(),
  queueNotification: vi.fn(),
  writeAuditLog: vi.fn(),
  sendGenericEmail: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  env: {} as { ALERT_FALLBACK_EMAIL?: string },
}))

vi.mock('@/lib/env', () => ({ env: mocks.env }))
vi.mock('@/integrations/email', () => ({
  emailProvider: { sendGenericEmail: mocks.sendGenericEmail },
}))
vi.mock('@/lib/db', () => ({ db: { user: { findMany: mocks.findAdmins } } }))
vi.mock('@/services/inbox.service', () => ({ notifyAdmins: mocks.notifyAdmins }))
vi.mock('@/services/notification.service', () => ({ queueNotification: mocks.queueNotification }))
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

/** Every slug queued to a channel, in call order. */
const queuedOn = (channel: string) =>
  mocks.queueNotification.mock.calls
    .map(([arg]) => arg)
    .filter((arg) => arg.channel === channel)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.env.ALERT_FALLBACK_EMAIL = undefined
  mocks.sendGenericEmail.mockResolvedValue(undefined)
  mocks.findAdmins.mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }])
  mocks.notifyAdmins.mockResolvedValue(2)
  mocks.queueNotification.mockResolvedValue(undefined)
  mocks.writeAuditLog.mockResolvedValue(undefined)
})

describe('how far an alert travels', () => {
  it('sends a critical one to the inbox, by email and by SMS — to every admin', async () => {
    const result = await raiseOperationalAlert(CRITICAL)

    expect(mocks.notifyAdmins).toHaveBeenCalledOnce()
    expect(queuedOn('EMAIL').map((a) => a.userId)).toEqual(['admin-1', 'admin-2'])
    expect(queuedOn('SMS').map((a) => a.userId)).toEqual(['admin-1', 'admin-2'])
    expect(result).toMatchObject({ admins: 2, inbox: true, email: true, sms: true })
  })

  it('stops a warning at the inbox and email — SMS is reserved', async () => {
    // SMS costs money on every send. Spending it on everything is how people
    // learn to ignore it, which costs more.
    await raiseOperationalAlert(WARNING)

    expect(mocks.notifyAdmins).toHaveBeenCalledOnce()
    expect(queuedOn('EMAIL')).toHaveLength(2)
    expect(queuedOn('SMS')).toHaveLength(0)
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

describe('what the channels are given', () => {
  it('sends the plain title, without the marker the inbox gets', async () => {
    await raiseOperationalAlert(CRITICAL)

    // The 🔴 makes an inbox row scannable and costs nothing there. In an SMS it
    // forces UCS-2 and halves the characters per segment, so it must not reach
    // the payload the templates render.
    const [sms] = queuedOn('SMS')
    expect(sms.payload).toEqual({ title: CRITICAL.title, detail: CRITICAL.body })
    expect(JSON.stringify(sms.payload)).not.toContain('🔴')

    expect(mocks.notifyAdmins.mock.calls[0][0].title).toContain('🔴')
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
    // The one channel that does not depend on the database being readable or a
    // provider being up. When the notification worker itself is the thing that
    // failed, this is the only thing that leaves the building.
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
  it('still emails and texts when the inbox write throws', async () => {
    mocks.notifyAdmins.mockRejectedValue(new Error('inbox table locked'))

    const result = await raiseOperationalAlert(CRITICAL)

    expect(result.inbox).toBe(false)
    expect(queuedOn('EMAIL')).toHaveLength(2)
    expect(queuedOn('SMS')).toHaveLength(2)
  })

  it('still texts when email queueing throws', async () => {
    mocks.queueNotification.mockImplementation(({ channel }: { channel: string }) =>
      channel === 'EMAIL' ? Promise.reject(new Error('resend down')) : Promise.resolve(),
    )

    const result = await raiseOperationalAlert(CRITICAL)

    expect(result.email).toBe(false)
    expect(result.sms).toBe(true)
  })

  it('reaches the other admins when one of them cannot be queued', async () => {
    // Four founders. The one with a malformed row must not be the reason the
    // other three hear nothing.
    mocks.queueNotification.mockImplementation(({ userId }: { userId: string }) =>
      userId === 'admin-1' ? Promise.reject(new Error('no phone number')) : Promise.resolve(),
    )

    const result = await raiseOperationalAlert(CRITICAL)

    expect(result.sms).toBe(true)
    expect(queuedOn('SMS')).toHaveLength(2)
  })

  it('never throws, whatever fails', async () => {
    // An alert is raised because something already went wrong. A failure to
    // deliver it must not become a second failure that takes down the job
    // reporting the first.
    mocks.findAdmins.mockRejectedValue(new Error('db down'))
    mocks.notifyAdmins.mockRejectedValue(new Error('db down'))
    mocks.writeAuditLog.mockRejectedValue(new Error('db down'))
    mocks.queueNotification.mockRejectedValue(new Error('db down'))

    await expect(raiseOperationalAlert(CRITICAL)).resolves.toMatchObject({
      admins: 0,
      inbox: false,
      email: false,
      sms: false,
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
    expect(mocks.queueNotification).not.toHaveBeenCalled()
    // An alerting system with no recipients looks exactly like a quiet night
    // from the outside. This is the line that tells the two apart.
    expect(
      mocks.loggerError.mock.calls.some(([msg]) => /no active admin/i.test(String(msg))),
    ).toBe(true)
  })
})

/**
 * This system runs with a single admin, by decision. Every channel above routes
 * through an ACTIVE `User` row and the notification queue, so that chain has
 * three links — no active admin, a suspended account, a flush worker that is
 * itself what died — and not one of them has a spare.
 *
 * `ALERT_FALLBACK_EMAIL` is the destination that does not depend on anybody's
 * account.
 */
describe('the destination that does not depend on an account', () => {
  it('reaches the standing address even when there is no admin at all', async () => {
    mocks.env.ALERT_FALLBACK_EMAIL = 'ops@example.test'
    mocks.findAdmins.mockResolvedValue([])

    const result = await raiseOperationalAlert(CRITICAL)

    expect(result.admins).toBe(0)
    expect(result.fallback).toBe(true)
    const [to, subject, html] = mocks.sendGenericEmail.mock.calls[0]
    expect(to).toBe('ops@example.test')
    expect(subject).toContain(CRITICAL.title)
    expect(html).toContain('9 declined by the bank')
  })

  it('sends directly rather than queueing — the queue may be what broke', async () => {
    mocks.env.ALERT_FALLBACK_EMAIL = 'ops@example.test'

    await raiseOperationalAlert(CRITICAL)

    // Putting the alert about a dead notification worker into that worker's
    // queue is not a plan.
    expect(mocks.sendGenericEmail).toHaveBeenCalledOnce()
    expect(queuedOn('EMAIL').map((a) => a.userId)).toEqual(['admin-1', 'admin-2'])
  })

  it('is reserved for critical alerts', async () => {
    mocks.env.ALERT_FALLBACK_EMAIL = 'ops@example.test'

    await raiseOperationalAlert(WARNING)

    expect(mocks.sendGenericEmail).not.toHaveBeenCalled()
  })

  it('is a no-op when unset, leaving the admin fan-out as the whole story', async () => {
    const result = await raiseOperationalAlert(CRITICAL)

    expect(mocks.sendGenericEmail).not.toHaveBeenCalled()
    expect(result).toMatchObject({ fallback: false, email: true, sms: true })
  })

  it('escapes what it interpolates — none of it is authored by a person', async () => {
    mocks.env.ALERT_FALLBACK_EMAIL = 'ops@example.test'

    // A gateway failure string or a Prisma error goes straight into this body.
    await raiseOperationalAlert({
      ...CRITICAL,
      title: 'gateway said <script>alert(1)</script>',
      body: 'reason: "5 & 6" <b>bold</b>',
    })

    const html = mocks.sendGenericEmail.mock.calls[0][2]
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
  })

  it('does not let its own failure cost the admin channels', async () => {
    mocks.env.ALERT_FALLBACK_EMAIL = 'ops@example.test'
    mocks.sendGenericEmail.mockRejectedValue(new Error('resend down'))

    const result = await raiseOperationalAlert(CRITICAL)

    expect(result.fallback).toBe(false)
    expect(result.email).toBe(true)
    expect(result.sms).toBe(true)
  })

  it('records whether the fallback caught it when no admin could be reached', async () => {
    mocks.env.ALERT_FALLBACK_EMAIL = 'ops@example.test'
    mocks.findAdmins.mockResolvedValue([])

    await raiseOperationalAlert(CRITICAL)

    const [, meta] = mocks.loggerError.mock.calls.find(([msg]) =>
      /no active admin/i.test(String(msg)),
    )!
    expect(meta).toMatchObject({ reachedFallback: true })
  })
})
