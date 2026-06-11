import { Prisma } from '@prisma/client'
import { env } from '@/lib/env'
import { db } from '@/lib/db'
import { notificationRepo } from '@/repositories/notification.repository'
import { userRepo } from '@/repositories/user.repository'
import { smsProvider } from '@/integrations/sms'
import { emailProvider } from '@/integrations/email'

// Defined locally to avoid dependency on Prisma client generation state
type NotifChannel = 'SMS' | 'EMAIL' | 'PUSH' | 'WHATSAPP'
type NotifStatus = 'QUEUED' | 'SENT' | 'FAILED'

type NotifPrefs = { userId: string; sms: boolean; email: boolean; push: boolean; whatsapp: boolean }

/** Member-facing notification feed: filtered, cursor-paginated, with totals. */
export async function getMemberNotifications(
  userId: string,
  opts: { channel?: NotifChannel; status?: NotifStatus; cursor?: string; limit?: number } = {},
) {
  const limit = opts.limit ?? 25
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(opts.channel && { channel: opts.channel }),
    ...(opts.status && { status: opts.status }),
  }

  const [rows, total, failedCount] = await Promise.all([
    db.notification.findMany({
      where,
      take: limit + 1,
      ...(opts.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, channel: true, status: true, sentAt: true, createdAt: true,
        template: { select: { slug: true } },
      },
    }),
    db.notification.count({ where: { userId } }),
    db.notification.count({ where: { userId, status: 'FAILED' } }),
  ])

  const hasNextPage = rows.length > limit
  const items = hasNextPage ? rows.slice(0, limit) : rows
  const nextCursor = hasNextPage ? (items[items.length - 1]?.id ?? null) : null

  return { items, total, failedCount, nextCursor }
}

type QueuedNotification = {
  id: string
  userId: string
  channel: string
  status: string
  payload: unknown
  createdAt: Date
  template: { id: string; slug: string; channel: string; body: string }
  user: { email: string | null; phone: string | null }
}

// ---------------------------------------------------------------------------
// Template interpolation
// ---------------------------------------------------------------------------

function interpolate(template: string, payload: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = payload[key]
    return value !== undefined && value !== null ? String(value) : `{{${key}}}`
  })
}

// ---------------------------------------------------------------------------
// Mandatory notification slugs — bypass user preference check
// These are financial events that members must always receive.
// ---------------------------------------------------------------------------

const MANDATORY_SLUGS = new Set([
  'debit-success',
  'debit-pending',
  'payment-failed-sms',
  'payment-failed-email',
  'overdue-reminder',
  'overdue-reminder-email',
])

// ---------------------------------------------------------------------------
// Email dispatch — routed by template slug
// ---------------------------------------------------------------------------

async function dispatchEmail(
  notificationId: string,
  to: string,
  slug: string,
  body: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const firstName = String(payload.firstName ?? '')
  const amount = String(payload.amount ?? '0')
  const period = String(payload.period ?? payload.month ?? '')
  const dashboardUrl = String(payload.url ?? env.NEXTAUTH_URL ?? '')

  switch (slug) {
    case 'welcome-email':
      await emailProvider.sendWelcomeEmail(to, firstName)
      break
    case 'payment-success-email':
      await emailProvider.sendPaymentSuccessEmail(to, firstName, amount, period)
      break
    case 'payment-failed-email':
      await emailProvider.sendPaymentFailedEmail(to, firstName, amount, period, dashboardUrl)
      break
    case 'overdue-reminder-email':
      await emailProvider.sendOverdueReminderEmail(to, firstName, amount, period, dashboardUrl)
      break
    default:
      await emailProvider.sendGenericEmail(
        to,
        `Xkimm Xa Mali`,
        `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">${interpolate(body, payload)}</div>`,
      )
  }

  await notificationRepo.update(notificationId, { status: 'SENT', sentAt: new Date() })
}

// ---------------------------------------------------------------------------
// SMS dispatch
// ---------------------------------------------------------------------------

async function dispatchSMS(
  notificationId: string,
  phone: string,
  slug: string,
  body: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const text = interpolate(body, payload)
  const normalised = smsProvider.normalisePhone(phone)

  const [message] = await smsProvider.send({
    to: normalised,
    body: text,
    userSuppliedId: notificationId,
  })

  const gatewayStatus = message?.status?.type ?? 'UNKNOWN'
  const delivered: NotifStatus =
    gatewayStatus === 'DELIVERED' || gatewayStatus === 'SENT' || gatewayStatus === 'ACCEPTED'
      ? 'SENT'
      : 'QUEUED'

  await notificationRepo.update(notificationId, {
    status: delivered,
    sentAt: delivered === 'SENT' ? new Date() : null,
  })
}

// ---------------------------------------------------------------------------
// Public: queue a notification for deferred delivery via the flush worker
// ---------------------------------------------------------------------------

export async function queueNotification(params: {
  userId: string
  templateSlug: string
  channel: NotifChannel
  payload: Record<string, unknown>
}): Promise<void> {
  const template = await notificationRepo.findTemplate(params.templateSlug)

  // Soft-fail when template doesn't exist — jobs may call this before seeding
  if (!template) return

  await notificationRepo.create({
    userId: params.userId,
    templateId: template.id,
    channel: params.channel,
    status: 'QUEUED',
    payload: params.payload as Prisma.InputJsonValue,
  })
}

// ---------------------------------------------------------------------------
// Public: immediately send one notification (no queue)
// ---------------------------------------------------------------------------

export async function sendNotificationNow(params: {
  userId: string
  templateSlug: string
  channel: NotifChannel
  payload: Record<string, unknown>
}): Promise<void> {
  const [template, user, prefs] = await Promise.all([
    notificationRepo.findTemplate(params.templateSlug),
    userRepo.findById(params.userId),
    notificationRepo.findPreference(params.userId),
  ])

  if (!template || !user) return

  // Enforce notification preferences unless mandatory
  const typedPrefs = prefs as NotifPrefs | null
  if (!MANDATORY_SLUGS.has(params.templateSlug) && typedPrefs) {
    if (params.channel === 'SMS' && !typedPrefs.sms) return
    if (params.channel === 'EMAIL' && !typedPrefs.email) return
    if (params.channel === 'PUSH' && !typedPrefs.push) return
    if (params.channel === 'WHATSAPP' && !typedPrefs.whatsapp) return
  }

  const notification = await notificationRepo.create({
    userId: params.userId,
    templateId: template.id,
    channel: params.channel,
    status: 'QUEUED',
    payload: params.payload as Prisma.InputJsonValue,
  })

  const payload = params.payload

  try {
    if (params.channel === 'EMAIL' && user.email) {
      await dispatchEmail(notification.id, user.email, template.slug, template.body, payload)
    } else if (params.channel === 'SMS' && user.phone) {
      await dispatchSMS(notification.id, user.phone, template.slug, template.body, payload)
    }
  } catch (err) {
    await notificationRepo.update(notification.id, { status: 'FAILED' })
    throw err
  }
}

// ---------------------------------------------------------------------------
// Public: flush a batch of QUEUED notifications (called by Inngest worker)
// ---------------------------------------------------------------------------

export type FlushResult = {
  processed: number
  sent: number
  failed: number
}

const MAX_RETRIES = 3

export async function flushQueuedNotifications(batchSize = 100): Promise<FlushResult> {
  // Atomically claim a batch by setting status to FAILED temporarily — prevents
  // duplicate dispatch when multiple Inngest replays run in parallel. Use a
  // transaction to find-and-mark in one round-trip.
  const now = new Date()
  const ids = await notificationRepo.findReady(batchSize, MAX_RETRIES)

  if (ids.length === 0) return { processed: 0, sent: 0, failed: 0 }

  const claimed = await notificationRepo.findMany(
    { id: { in: ids } },
    {
      include: {
        template: true,
        user: { select: { email: true, phone: true } },
      },
    },
  )

  const allPrefs = await notificationRepo.findPreferences({
    userId: { in: [...new Set((claimed as unknown as QueuedNotification[]).map((n) => n.userId))] },
  })
  const prefsMap = new Map((allPrefs as NotifPrefs[]).map((p) => [p.userId, p]))

  let sent = 0
  let failed = 0

  await Promise.all(
    (claimed as unknown as QueuedNotification[]).map(async (notification) => {
      const prefs = prefsMap.get(notification.userId)
      const payload = notification.payload as Record<string, unknown>
      const slug = notification.template.slug

      // User opted out — mark silently sent (preference respected, not a failure)
      if (!MANDATORY_SLUGS.has(slug) && prefs) {
        if (
          (notification.channel === 'SMS' && !prefs.sms) ||
          (notification.channel === 'EMAIL' && !prefs.email) ||
          (notification.channel === 'PUSH' && !prefs.push) ||
          (notification.channel === 'WHATSAPP' && !prefs.whatsapp)
        ) {
          await notificationRepo.update(notification.id, { status: 'SENT', sentAt: now, errorMessage: null })
          sent++
          return
        }
      }

      try {
        if (notification.channel === 'EMAIL' && notification.user.email) {
          await dispatchEmail(notification.id, notification.user.email, slug, notification.template.body, payload)
          sent++
        } else if (notification.channel === 'SMS' && notification.user.phone) {
          await dispatchSMS(notification.id, notification.user.phone, slug, notification.template.body, payload)
          sent++
        } else {
          // No contact details — mark sent to drain the queue
          await notificationRepo.update(notification.id, { status: 'SENT', sentAt: now, errorMessage: null })
          sent++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await notificationRepo.update(notification.id, {
          status: 'FAILED',
          errorMessage: msg,
          retryCount: { increment: 1 },
        })
        failed++
      }
    }),
  )

  return { processed: claimed.length, sent, failed }
}

// ---------------------------------------------------------------------------
// Public: requeue FAILED notifications that haven't exhausted their retries
// Called by notification-flush before each batch to promote eligible records
// ---------------------------------------------------------------------------

export async function requeueFailedNotifications(): Promise<number> {
  const result = await notificationRepo.updateMany(
    {
      status: 'FAILED',
      retryCount: { lt: MAX_RETRIES },
      errorMessage: { not: 'in-flight' }, // skip records currently being processed
    },
    { status: 'QUEUED' },
  )
  return result.count
}

// ---------------------------------------------------------------------------
// Public: update delivery status from BulkSMS webhook receipt
// ---------------------------------------------------------------------------

export async function updateSMSDeliveryStatus(
  notificationId: string,
  deliveryStatus: string,
): Promise<void> {
  const terminal = ['DELIVERED', 'FAILED', 'UNKNOWN']
  if (!terminal.includes(deliveryStatus)) return

  const status: NotifStatus = deliveryStatus === 'DELIVERED' ? 'SENT' : 'FAILED'

  await notificationRepo.updateMany(
    { id: notificationId, channel: 'SMS' },
    {
      status,
      sentAt: status === 'SENT' ? new Date() : undefined,
    },
  )
}
