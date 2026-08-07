import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

// ---------------------------------------------------------------------------
// Mock heavy dependencies before importing the service
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  db: {
    notificationTemplate: { findUnique: vi.fn() },
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    notificationPreference: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findUnique: vi.fn() },
    $queryRaw: vi.fn(),
  },
}))

vi.mock('@/integrations/sms', () => ({
  smsProvider: {
    send: vi.fn(),
    normalisePhone: vi.fn((p: string) => p),
  },
}))

vi.mock('@/integrations/email', () => ({
  emailProvider: {
    sendWelcomeEmail: vi.fn(),
    sendPaymentSuccessEmail: vi.fn(),
    sendPaymentFailedEmail: vi.fn(),
    sendOverdueReminderEmail: vi.fn(),
    sendGenericEmail: vi.fn(),
  },
}))

vi.mock('@/lib/env', () => ({
  env: {
    RESEND_API_KEY: 'test-key',
    RESEND_FROM_EMAIL: 'noreply@xxm.test',
    BULKSMS_USERNAME: 'test',
    BULKSMS_PASSWORD: 'test',
  },
}))

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: 'mock-email-id' }) },
  })),
}))

// ---------------------------------------------------------------------------
// Import after mocks are registered
// ---------------------------------------------------------------------------

import { db } from '@/lib/db'
import { smsProvider } from '@/integrations/sms'
import { emailProvider } from '@/integrations/email'
import {
  queueNotification,
  updateSMSDeliveryStatus,
  flushQueuedNotifications,
  recoverStalledNotifications,
} from '@/services/notification.service'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockTemplate = {
  id: 'tpl-1',
  slug: 'debit-success',
  channel: 'SMS',
  body: 'Xkimm Xa Mali Foundation: R{{amount}} received. Thanks, {{firstName}}!',
}

const mockUser = { email: 'test@example.com', phone: '0821234567' }

const mockPrefs = { userId: 'user-1', sms: true, email: true, push: true }

// ---------------------------------------------------------------------------
// queueNotification
// ---------------------------------------------------------------------------

describe('queueNotification', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a QUEUED notification when template exists', async () => {
    ;(db.notificationTemplate.findUnique as MockedFunction<typeof db.notificationTemplate.findUnique>)
      .mockResolvedValue(mockTemplate as never)
    ;(db.notification.create as MockedFunction<typeof db.notification.create>)
      .mockResolvedValue({ id: 'notif-1' } as never)

    await queueNotification({
      userId: 'user-1',
      templateSlug: 'debit-success',
      channel: 'SMS',
      payload: { amount: '500' },
    })

    expect(db.notification.create).toHaveBeenCalledOnce()
    expect(db.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          status: 'QUEUED',
          channel: 'SMS',
        }),
      }),
    )
  })

  it('soft-fails when template slug does not exist', async () => {
    ;(db.notificationTemplate.findUnique as MockedFunction<typeof db.notificationTemplate.findUnique>)
      .mockResolvedValue(null)

    await expect(
      queueNotification({
        userId: 'user-1',
        templateSlug: 'nonexistent-slug',
        channel: 'SMS',
        payload: {},
      }),
    ).resolves.toBeUndefined()

    expect(db.notification.create).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// updateSMSDeliveryStatus
// ---------------------------------------------------------------------------

describe('updateSMSDeliveryStatus', () => {
  beforeEach(() => vi.clearAllMocks())

  it('marks DELIVERED as SENT', async () => {
    ;(db.notification.updateMany as MockedFunction<typeof db.notification.updateMany>)
      .mockResolvedValue({ count: 1 } as never)

    await updateSMSDeliveryStatus('notif-1', 'DELIVERED')

    expect(db.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'notif-1', channel: 'SMS' }),
        data: expect.objectContaining({ status: 'SENT' }),
      }),
    )
  })

  it('marks FAILED as FAILED', async () => {
    ;(db.notification.updateMany as MockedFunction<typeof db.notification.updateMany>)
      .mockResolvedValue({ count: 1 } as never)

    await updateSMSDeliveryStatus('notif-1', 'FAILED')

    expect(db.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    )
  })

  it('does nothing for non-terminal status SENT', async () => {
    await updateSMSDeliveryStatus('notif-1', 'SENT')
    expect(db.notification.updateMany).not.toHaveBeenCalled()
  })

  it('does nothing for non-terminal status ACCEPTED', async () => {
    await updateSMSDeliveryStatus('notif-1', 'ACCEPTED')
    expect(db.notification.updateMany).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// flushQueuedNotifications
// ---------------------------------------------------------------------------

describe('flushQueuedNotifications', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns zero counts when queue is empty', async () => {
    // $queryRaw claims the batch atomically; empty array means nothing to process.
    ;(db.$queryRaw as MockedFunction<typeof db.$queryRaw>).mockResolvedValue([])

    const result = await flushQueuedNotifications()
    expect(result).toEqual({ processed: 0, sent: 0, failed: 0 })
    expect(db.notification.findMany).not.toHaveBeenCalled()
  })

  it('sends SMS notifications and marks them SENT', async () => {
    const queued = [
      {
        id: 'notif-1',
        userId: 'user-1',
        channel: 'SMS',
        status: 'QUEUED',
        createdAt: new Date(),
        template: { ...mockTemplate },
        user: mockUser,
        payload: { amount: '500', firstName: 'Kurhula' },
      },
    ]

    ;(db.$queryRaw as MockedFunction<typeof db.$queryRaw>).mockResolvedValue([{ id: 'notif-1' }])
    ;(db.notification.findMany as MockedFunction<typeof db.notification.findMany>)
      .mockResolvedValue(queued as never)
    ;(db.notificationPreference.findMany as MockedFunction<typeof db.notificationPreference.findMany>)
      .mockResolvedValue([mockPrefs] as never)
    ;(smsProvider.send as MockedFunction<typeof smsProvider.send>)
      .mockResolvedValue([{ id: 'sms-1', status: { type: 'ACCEPTED' } }] as never)
    ;(db.notification.update as MockedFunction<typeof db.notification.update>)
      .mockResolvedValue({} as never)

    const result = await flushQueuedNotifications()

    expect(smsProvider.send).toHaveBeenCalledOnce()
    expect(smsProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Xkimm Xa Mali Foundation: R500 received. Thanks, Kurhula!',
      }),
    )
    expect(result.processed).toBe(1)
    expect(result.sent).toBe(1)
    expect(result.failed).toBe(0)
  })

  it('respects user SMS preference — skips when sms=false for non-mandatory slug', async () => {
    const queued = [
      {
        id: 'notif-2',
        userId: 'user-2',
        channel: 'SMS',
        status: 'QUEUED',
        createdAt: new Date(),
        template: { id: 'tpl-2', slug: 'debit-morning-warning', channel: 'SMS', body: 'Hello {{firstName}}' },
        user: mockUser,
        payload: { firstName: 'Test' },
      },
    ]
    const prefsNoSMS = { userId: 'user-2', sms: false, email: true, push: true }

    ;(db.$queryRaw as MockedFunction<typeof db.$queryRaw>).mockResolvedValue([{ id: 'notif-2' }])
    ;(db.notification.findMany as MockedFunction<typeof db.notification.findMany>)
      .mockResolvedValue(queued as never)
    ;(db.notificationPreference.findMany as MockedFunction<typeof db.notificationPreference.findMany>)
      .mockResolvedValue([prefsNoSMS] as never)
    ;(db.notification.update as MockedFunction<typeof db.notification.update>)
      .mockResolvedValue({} as never)

    const result = await flushQueuedNotifications()

    // Should still count as "sent" (gracefully skipped, not failed)
    expect(smsProvider.send).not.toHaveBeenCalled()
    expect(result.processed).toBe(1)
    expect(result.sent).toBe(1)
    expect(result.failed).toBe(0)
  })

  it('bypasses SMS preference for mandatory slug debit-success', async () => {
    const queued = [
      {
        id: 'notif-3',
        userId: 'user-3',
        channel: 'SMS',
        status: 'QUEUED',
        createdAt: new Date(),
        template: { id: 'tpl-3', slug: 'debit-success', channel: 'SMS', body: 'Paid R{{amount}}' },
        user: mockUser,
        payload: { amount: '300' },
      },
    ]
    const prefsNoSMS = { userId: 'user-3', sms: false, email: true, push: true }

    ;(db.$queryRaw as MockedFunction<typeof db.$queryRaw>).mockResolvedValue([{ id: 'notif-3' }])
    ;(db.notification.findMany as MockedFunction<typeof db.notification.findMany>)
      .mockResolvedValue(queued as never)
    ;(db.notificationPreference.findMany as MockedFunction<typeof db.notificationPreference.findMany>)
      .mockResolvedValue([prefsNoSMS] as never)
    ;(smsProvider.send as MockedFunction<typeof smsProvider.send>)
      .mockResolvedValue([{ id: 'sms-3', status: { type: 'ACCEPTED' } }] as never)
    ;(db.notification.update as MockedFunction<typeof db.notification.update>)
      .mockResolvedValue({} as never)

    const result = await flushQueuedNotifications()

    // Mandatory slug bypasses the preference — SMS must be sent
    expect(smsProvider.send).toHaveBeenCalledOnce()
    expect(result.sent).toBe(1)
  })

  it('marks notification FAILED and counts it when send throws', async () => {
    const queued = [
      {
        id: 'notif-4',
        userId: 'user-4',
        channel: 'SMS',
        status: 'QUEUED',
        createdAt: new Date(),
        template: mockTemplate,
        user: mockUser,
        payload: { amount: '100', firstName: 'Test' },
      },
    ]

    ;(db.$queryRaw as MockedFunction<typeof db.$queryRaw>).mockResolvedValue([{ id: 'notif-4' }])
    ;(db.notification.findMany as MockedFunction<typeof db.notification.findMany>)
      .mockResolvedValue(queued as never)
    ;(db.notificationPreference.findMany as MockedFunction<typeof db.notificationPreference.findMany>)
      .mockResolvedValue([mockPrefs] as never)
    ;(smsProvider.send as MockedFunction<typeof smsProvider.send>)
      .mockRejectedValue(new Error('BulkSMS error 503'))
    ;(db.notification.update as MockedFunction<typeof db.notification.update>)
      .mockResolvedValue({} as never)

    const result = await flushQueuedNotifications()

    expect(db.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED' }),
      }),
    )
    expect(result.failed).toBe(1)
    expect(result.sent).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// recoverStalledNotifications
// ---------------------------------------------------------------------------

describe('recoverStalledNotifications', () => {
  beforeEach(() => vi.clearAllMocks())

  it('requeues only in-flight rows whose claim is older than the stale window', async () => {
    ;(db.notification.updateMany as MockedFunction<typeof db.notification.updateMany>)
      .mockResolvedValue({ count: 2 } as never)

    const recovered = await recoverStalledNotifications()

    expect(recovered).toBe(2)
    expect(db.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'in-flight',
          updatedAt: expect.objectContaining({ lt: expect.any(Date) }),
        }),
        data: expect.objectContaining({ status: 'QUEUED', errorMessage: null }),
      }),
    )

    // Cutoff is ~15 minutes in the past — never "now" (which would disturb an
    // actively-processing batch) and never in the future.
    const call = (db.notification.updateMany as MockedFunction<typeof db.notification.updateMany>).mock.calls[0]![0] as {
      where: { updatedAt: { lt: Date } }
    }
    const ageMs = Date.now() - call.where.updatedAt.lt.getTime()
    expect(ageMs).toBeGreaterThan(10 * 60 * 1000)
    expect(ageMs).toBeLessThan(20 * 60 * 1000)
  })
})

// ---------------------------------------------------------------------------
// Email dispatch idempotency
// ---------------------------------------------------------------------------

describe('email dispatch is idempotent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('passes the notification id as the Resend idempotency key', async () => {
    const queued = [
      {
        id: 'notif-email-1',
        userId: 'user-9',
        channel: 'EMAIL',
        status: 'QUEUED',
        createdAt: new Date(),
        template: { id: 'tpl-e', slug: 'payment-success-email', channel: 'EMAIL', body: 'x' },
        user: { email: 'member@example.com', phone: null },
        payload: { firstName: 'Zo', amount: '500', period: '2025-01' },
      },
    ]

    ;(db.$queryRaw as MockedFunction<typeof db.$queryRaw>).mockResolvedValue([{ id: 'notif-email-1' }])
    ;(db.notification.findMany as MockedFunction<typeof db.notification.findMany>)
      .mockResolvedValue(queued as never)
    ;(db.notificationPreference.findMany as MockedFunction<typeof db.notificationPreference.findMany>)
      .mockResolvedValue([{ userId: 'user-9', sms: true, email: true, push: true }] as never)
    ;(db.notification.update as MockedFunction<typeof db.notification.update>)
      .mockResolvedValue({} as never)

    await flushQueuedNotifications()

    // The notification id flows through as the last arg so a recovered re-dispatch
    // is de-duplicated by Resend instead of sending a second email.
    expect(emailProvider.sendPaymentSuccessEmail).toHaveBeenCalledWith(
      'member@example.com', 'Zo', '500', '2025-01', 'notif-email-1',
    )
  })
})

// ---------------------------------------------------------------------------
// Template interpolation (tested via SMS body)
// ---------------------------------------------------------------------------

describe('template interpolation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('replaces all {{placeholders}} with payload values', async () => {
    const queued = [
      {
        id: 'notif-5',
        userId: 'user-5',
        channel: 'SMS',
        status: 'QUEUED',
        createdAt: new Date(),
        template: {
          id: 'tpl-5',
          slug: 'debit-success',
          channel: 'SMS',
          body: 'R{{amount}} for {{period}} from {{firstName}}',
        },
        user: mockUser,
        payload: { amount: '750', period: '2025-01', firstName: 'Busi' },
      },
    ]

    ;(db.$queryRaw as MockedFunction<typeof db.$queryRaw>).mockResolvedValue([{ id: 'notif-5' }])
    ;(db.notification.findMany as MockedFunction<typeof db.notification.findMany>)
      .mockResolvedValue(queued as never)
    ;(db.notificationPreference.findMany as MockedFunction<typeof db.notificationPreference.findMany>)
      .mockResolvedValue([mockPrefs] as never)
    ;(smsProvider.send as MockedFunction<typeof smsProvider.send>)
      .mockResolvedValue([{ id: 'sms-5', status: { type: 'DELIVERED' } }] as never)
    ;(db.notification.update as MockedFunction<typeof db.notification.update>)
      .mockResolvedValue({} as never)

    await flushQueuedNotifications()

    expect(smsProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'R750 for 2025-01 from Busi' }),
    )
  })

  it('leaves missing placeholders intact', async () => {
    const queued = [
      {
        id: 'notif-6',
        userId: 'user-6',
        channel: 'SMS',
        status: 'QUEUED',
        createdAt: new Date(),
        template: {
          id: 'tpl-6',
          slug: 'debit-success',
          channel: 'SMS',
          body: 'Hello {{firstName}}, amount {{amount}} missing {{missing}}',
        },
        user: mockUser,
        payload: { firstName: 'Lee', amount: '200' },
      },
    ]

    ;(db.$queryRaw as MockedFunction<typeof db.$queryRaw>).mockResolvedValue([{ id: 'notif-6' }])
    ;(db.notification.findMany as MockedFunction<typeof db.notification.findMany>)
      .mockResolvedValue(queued as never)
    ;(db.notificationPreference.findMany as MockedFunction<typeof db.notificationPreference.findMany>)
      .mockResolvedValue([mockPrefs] as never)
    ;(smsProvider.send as MockedFunction<typeof smsProvider.send>)
      .mockResolvedValue([{ id: 'sms-6', status: { type: 'ACCEPTED' } }] as never)
    ;(db.notification.update as MockedFunction<typeof db.notification.update>)
      .mockResolvedValue({} as never)

    await flushQueuedNotifications()

    expect(smsProvider.send).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Hello Lee, amount 200 missing {{missing}}' }),
    )
  })
})
