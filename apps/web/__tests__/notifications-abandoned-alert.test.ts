import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The quietest failure in the system.
 *
 * `requeueFailedNotifications` stops promoting a row once it has exhausted its
 * retries, so from that moment it sits FAILED forever. Nothing said anything:
 * the app was healthy, the jobs ran, the queue drained — and members simply
 * stopped being told their debit had failed.
 *
 * Every cause lands in the same place, which is why this counts abandoned rows
 * rather than guarding any one of them.
 */

const mocks = vi.hoisted(() => ({
  countAbandoned: vi.fn(),
  auditCount: vi.fn(),
  raiseAlert: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: {} }))
vi.mock('@/lib/inngest', () => ({ inngest: { createFunction: () => ({}) } }))
vi.mock('@/services/notification.service', () => ({
  flushQueuedNotifications: vi.fn(),
  requeueFailedNotifications: vi.fn(),
  recoverStalledNotifications: vi.fn(),
  countAbandonedNotifications: mocks.countAbandoned,
}))
vi.mock('@/repositories/audit.repository', () => ({ auditRepo: { count: mocks.auditCount } }))
vi.mock('@/services/alert.service', () => ({ raiseOperationalAlert: mocks.raiseAlert }))
vi.mock('@/inngest/on-failure', () => ({ alertOnFailure: () => vi.fn() }))

import { reportAbandonedNotifications } from '@/inngest/functions/notification-flush'

/** Runs every step body, as the first invocation of a run does. */
const step = { run: async <T>(_id: string, fn: () => Promise<T> | T): Promise<T> => fn() }

const ABANDONED = {
  total: 12,
  byChannel: { EMAIL: 9, SMS: 3 },
  sampleError: 'The gmail.com domain is not verified',
  latestAt: new Date('2026-08-08T10:00:00Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.countAbandoned.mockResolvedValue(ABANDONED)
  mocks.auditCount.mockResolvedValue(0)
  mocks.raiseAlert.mockResolvedValue(undefined)
})

describe('notifications that will never send', () => {
  it('raises a critical alert saying how many, on which channel, and why', async () => {
    const result = await reportAbandonedNotifications(step)

    expect(result).toEqual({ abandoned: 12, alerted: true })
    const alert = mocks.raiseAlert.mock.calls[0][0]
    expect(alert).toMatchObject({ code: 'NOTIFICATIONS_ABANDONED', severity: 'critical' })
    expect(alert.title).toContain('12')
    expect(alert.body).toContain('9 EMAIL')
    expect(alert.body).toContain('3 SMS')
    // "How many" without "why" leaves the reader to go and find out.
    expect(alert.body).toContain('The gmail.com domain is not verified')
  })

  it('keeps the title free of characters that cost an SMS segment', async () => {
    await reportAbandonedNotifications(step)
    expect(mocks.raiseAlert.mock.calls[0][0].title).toMatch(/^[\x20-\x7E]+$/)
  })

  it('says nothing when every notification is being delivered', async () => {
    mocks.countAbandoned.mockResolvedValue({ total: 0, byChannel: {}, sampleError: null, latestAt: null })

    const result = await reportAbandonedNotifications(step)

    expect(result).toEqual({ abandoned: 0, alerted: false })
    expect(mocks.raiseAlert).not.toHaveBeenCalled()
    // Nothing is wrong, so nothing is even looked up.
    expect(mocks.auditCount).not.toHaveBeenCalled()
  })
})

describe('not saying it 288 times a day', () => {
  // This job runs every five minutes. An alert that repeats on every run is not
  // an alert; it is a reason to mute the channel it arrives on.
  it('stays quiet when it has already said so recently', async () => {
    mocks.auditCount.mockResolvedValue(1)

    const result = await reportAbandonedNotifications(step)

    expect(result).toEqual({ abandoned: 12, alerted: false })
    expect(mocks.raiseAlert).not.toHaveBeenCalled()
  })

  it('throttles on the audit log, not on Redis', async () => {
    // Deliberate: the cache client is a no-op shim whenever Upstash is
    // unconfigured, so every read returns null and a Redis throttle fails
    // *open* — sending on every run. The reminder jobs already learned this.
    await reportAbandonedNotifications(step)

    const where = mocks.auditCount.mock.calls[0][0]
    expect(where).toMatchObject({ action: 'NOTIFICATIONS_ABANDONED' })
    expect(where.createdAt.gte).toBeInstanceOf(Date)
    expect(where.createdAt.gte.getTime()).toBeLessThan(Date.now())
  })

  it('speaks again once the quiet window has passed', async () => {
    mocks.auditCount.mockResolvedValue(0)
    await reportAbandonedNotifications(step)
    expect(mocks.raiseAlert).toHaveBeenCalledOnce()
  })
})
