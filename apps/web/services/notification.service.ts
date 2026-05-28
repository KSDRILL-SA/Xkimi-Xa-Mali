import { Resend } from 'resend'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { sendSMS, normalisePhone } from '@/lib/bulksms'
import {
  sendWelcomeEmail,
  sendPaymentSuccessEmail,
  sendPaymentFailedEmail,
  sendOverdueReminderEmail,
} from '@/lib/email'

// Defined locally to avoid dependency on Prisma client generation state
type NotifChannel = 'SMS' | 'EMAIL' | 'PUSH'
type NotifStatus = 'QUEUED' | 'SENT' | 'FAILED'

type NotifPrefs = { userId: string; sms: boolean; email: boolean; push: boolean }

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

const resend = new Resend(env.RESEND_API_KEY)

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
  const dashboardUrl = String(payload.url ?? process.env.NEXTAUTH_URL ?? '')

  switch (slug) {
    case 'welcome-email':
      await sendWelcomeEmail(to, firstName)
      break
    case 'payment-success-email':
      await sendPaymentSuccessEmail(to, firstName, amount, period)
      break
    case 'payment-failed-email':
      await sendPaymentFailedEmail(to, firstName, amount, period, dashboardUrl)
      break
    case 'overdue-reminder-email':
      await sendOverdueReminderEmail(to, firstName, amount, period, dashboardUrl)
      break
    default:
      // Generic fallback — interpolate the template body and send as HTML
      await resend.emails.send({
        from: env.RESEND_FROM_EMAIL,
        to,
        subject: `Xkimm Xa Mali`,
        html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">${interpolate(body, payload)}</div>`,
      })
  }

  await db.notification.update({
    where: { id: notificationId },
    data: { status: 'SENT', sentAt: new Date() },
  })
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
  const normalised = normalisePhone(phone)

  const [message] = await sendSMS({
    to: normalised,
    body: text,
    userSuppliedId: notificationId,
  })

  const gatewayStatus = message?.status?.type ?? 'UNKNOWN'
  const delivered: NotifStatus =
    gatewayStatus === 'DELIVERED' || gatewayStatus === 'SENT' || gatewayStatus === 'ACCEPTED'
      ? 'SENT'
      : 'QUEUED'

  await db.notification.update({
    where: { id: notificationId },
    data: {
      status: delivered,
      sentAt: delivered === 'SENT' ? new Date() : null,
    },
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
  const template = await db.notificationTemplate.findUnique({
    where: { slug: params.templateSlug },
  })

  // Soft-fail when template doesn't exist — jobs may call this before seeding
  if (!template) return

  await db.notification.create({
    data: {
      userId: params.userId,
      templateId: template.id,
      channel: params.channel,
      status: 'QUEUED',
      payload: params.payload as unknown,
    },
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
    db.notificationTemplate.findUnique({ where: { slug: params.templateSlug } }),
    db.user.findUnique({
      where: { id: params.userId },
      select: { email: true, phone: true },
    }),
    db.notificationPreference.findUnique({ where: { userId: params.userId } }),
  ])

  if (!template || !user) return

  // Enforce notification preferences unless mandatory
  const typedPrefs = prefs as NotifPrefs | null
  if (!MANDATORY_SLUGS.has(params.templateSlug) && typedPrefs) {
    if (params.channel === 'SMS' && !typedPrefs.sms) return
    if (params.channel === 'EMAIL' && !typedPrefs.email) return
    if (params.channel === 'PUSH' && !typedPrefs.push) return
  }

  const notification = await db.notification.create({
    data: {
      userId: params.userId,
      templateId: template.id,
      channel: params.channel,
      status: 'QUEUED',
      payload: params.payload as unknown,
    },
  })

  const payload = params.payload

  try {
    if (params.channel === 'EMAIL' && user.email) {
      await dispatchEmail(notification.id, user.email, template.slug, template.body, payload)
    } else if (params.channel === 'SMS' && user.phone) {
      await dispatchSMS(notification.id, user.phone, template.slug, template.body, payload)
    }
  } catch (err) {
    await db.notification.update({
      where: { id: notification.id },
      data: { status: 'FAILED' },
    })
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

export async function flushQueuedNotifications(batchSize = 100): Promise<FlushResult> {
  const queued = await db.notification.findMany({
    where: { status: 'QUEUED' },
    take: batchSize,
    orderBy: { createdAt: 'asc' },
    include: {
      template: true,
      user: {
        select: { email: true, phone: true },
      },
    },
  })

  if (queued.length === 0) return { processed: 0, sent: 0, failed: 0 }

  const allPrefs = await db.notificationPreference.findMany({
    where: { userId: { in: [...new Set((queued as QueuedNotification[]).map((n) => n.userId))] } },
  })

  const prefsMap = new Map(
    (allPrefs as NotifPrefs[]).map((p) => [p.userId, p]),
  )

  let sent = 0
  let failed = 0

  await Promise.all(
    (queued as QueuedNotification[]).map(async (notification) => {
      const prefs = prefsMap.get(notification.userId)
      const payload = notification.payload as Record<string, unknown>
      const slug = notification.template.slug

      // Check preference unless mandatory
      if (!MANDATORY_SLUGS.has(slug) && prefs) {
        if (notification.channel === 'SMS' && !prefs.sms) {
          await db.notification.update({ where: { id: notification.id }, data: { status: 'SENT', sentAt: new Date() } })
          sent++
          return
        }
        if (notification.channel === 'EMAIL' && !prefs.email) {
          await db.notification.update({ where: { id: notification.id }, data: { status: 'SENT', sentAt: new Date() } })
          sent++
          return
        }
        if (notification.channel === 'PUSH' && !prefs.push) {
          await db.notification.update({ where: { id: notification.id }, data: { status: 'SENT', sentAt: new Date() } })
          sent++
          return
        }
      }

      try {
        if (notification.channel === 'EMAIL' && notification.user.email) {
          await dispatchEmail(
            notification.id,
            notification.user.email,
            slug,
            notification.template.body,
            payload,
          )
          sent++
        } else if (notification.channel === 'SMS' && notification.user.phone) {
          await dispatchSMS(
            notification.id,
            notification.user.phone,
            slug,
            notification.template.body,
            payload,
          )
          sent++
        } else {
          // No contact info — mark sent to avoid infinite retry
          await db.notification.update({
            where: { id: notification.id },
            data: { status: 'SENT', sentAt: new Date() },
          })
          sent++
        }
      } catch {
        await db.notification.update({
          where: { id: notification.id },
          data: { status: 'FAILED' },
        })
        failed++
      }
    }),
  )

  return { processed: queued.length, sent, failed }
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

  await db.notification.updateMany({
    where: { id: notificationId, channel: 'SMS' },
    data: {
      status,
      sentAt: status === 'SENT' ? new Date() : undefined,
    },
  })
}
