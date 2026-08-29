import { Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import { env } from '@/lib/env'
import { db } from '@/lib/db'
import { notificationRepo } from '@/repositories/notification.repository'
import { userRepo } from '@/repositories/user.repository'
import { smsProvider } from '@/integrations/sms'
import { smsCost } from '@xxm/utils/sms'
import { logger } from '@xxm/observability'
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

/**
 * BulkSMS caps `userSuppliedId` at 20 characters — found live, 2026-08-29:
 * `BulkSMS 400: Validation error: items[0].userSuppliedId size must be
 * between 1 and 20`, on a real notification once BulkSMS credentials were
 * finally configured. This system's notification ids are 25-character
 * cuids, so *every* SMS would have failed this way, invisibly, the moment
 * the original "credentials not configured" error stopped hiding it.
 *
 * A truncated cuid isn't safe (cuids share a timestamp-ish prefix, so the
 * first 20 characters of many ids collide far more than the full id does).
 * Hashing keeps this deterministic — the same notification id always
 * produces the same short id, which matters for recovery: BulkSMS
 * deduplicates a resend after a worker crash by this value, the same
 * property the Resend idempotency key relies on for email.
 */
function shortSuppliedId(notificationId: string): string {
  return createHash('sha256').update(notificationId).digest('hex').slice(0, 20)
}

// ---------------------------------------------------------------------------
// Mandatory notification slugs — bypass user preference check
// These are financial events that members must always receive.
// ---------------------------------------------------------------------------

/**
 * Exported so a test can hold the membership of this set rather than infer it.
 *
 * Which messages a member may switch off is a decision about whether they can
 * end up not knowing their money stopped moving. It is worth stating in one
 * place and asserting, not discovering by reading two call sites.
 */
export const MANDATORY_SLUGS = new Set([
  'debit-success',
  'debit-pending',
  'payment-failed-sms',
  'payment-failed-email',
  'overdue-reminder',
  'overdue-reminder-email',
  // A reversal takes back money the member was already told had arrived. That
  // is the one message in this list they are most likely to need and least
  // likely to expect, so it is not opt-out-able either.
  'contribution-reversed-sms',
  'contribution-reversed-email',
  // Operational alerts to admins. These are not member notifications and the
  // opt-out was never meant to cover them: an admin who switched SMS off for
  // badge news would otherwise stop being told that a debit run collected
  // nothing. See `services/alert.service.ts`.
  'admin-alert-sms',
  'admin-alert-email',
  // The two messages that say money will stop moving and nothing else will.
  //
  // `mandate-cancelled` is sent by `mandate-status-sync` when a member's
  // DebiCheck authorisation is cancelled at their bank, out of band. Its own
  // comment there states why it exists: "without this the member's
  // contributions simply stop and the first they hear of it is a gap in their
  // statement". A preference toggle silently dropped it, which defeated the
  // entire purpose of sending it — the member kept believing they were
  // contributing while nothing was being collected.
  //
  // `mandate-rejected` is the same failure at the other end: the mandate was
  // never authorised, so they will never be debited at all, and unheard it
  // reads to them as a successful application.
  //
  // The line this list draws is money that did not move, or is about to stop
  // moving, as against news about it. A statement being ready is news
  // (`monthly-statement-notice` says so explicitly and is deliberately absent).
  // A debit order that no longer exists is not.
  'mandate-cancelled',
  'mandate-rejected',
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

  // The notification id is a stable idempotency key: if this row is recovered
  // and re-dispatched after a worker crash, Resend returns the original send
  // instead of delivering a duplicate email.
  const key = notificationId

  switch (slug) {
    case 'welcome-email':
      await emailProvider.sendWelcomeEmail(to, firstName, key)
      break
    case 'payment-success-email':
      await emailProvider.sendPaymentSuccessEmail(to, firstName, amount, period, key)
      break
    case 'payment-failed-email':
      await emailProvider.sendPaymentFailedEmail(to, firstName, amount, period, dashboardUrl, key)
      break
    case 'overdue-reminder-email':
      await emailProvider.sendOverdueReminderEmail(to, firstName, amount, period, dashboardUrl, key)
      break
    default:
      await emailProvider.sendGenericEmail(
        to,
        `Xkimi Xa Mali Foundation`,
        `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">${interpolate(body, payload)}</div>`,
        key,
      )
  }

  // `errorMessage: null` clears the 'in-flight' claim marker set while this
  // batch was picked up (see `findReady`) — otherwise a row that sends
  // successfully keeps that string forever, indistinguishable at a glance
  // from a row still mid-flight or one that actually failed with that exact
  // text as a real error. `countAbandonedNotifications` already had to
  // special-case filtering 'in-flight' out as a fake error elsewhere in this
  // file, which was the tell this was a known rough edge, just not closed
  // everywhere it could leak.
  await notificationRepo.update(notificationId, { status: 'SENT', sentAt: new Date(), errorMessage: null })
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

  // Seeded templates are held to GSM-7 by a test, but an admin broadcast and a
  // rendered placeholder are neither seeded nor reviewed. One character outside
  // the alphabet drops a segment from 160 characters to 70, so an unremarkable
  // em dash can more than double what the send costs. Report it rather than pay
  // it quietly.
  const cost = smsCost(text)
  if (cost.encoding === 'UCS-2') {
    logger.warn('SMS forced into UCS-2, halving what fits per segment', {
      slug,
      segments: cost.segments,
      offendingCharacters: cost.offendingCharacters,
    })
  } else if (cost.segments > 2) {
    logger.warn('SMS will be billed as several segments', { slug, segments: cost.segments, units: cost.units })
  }

  const [message] = await smsProvider.send({
    to: normalised,
    body: text,
    userSuppliedId: shortSuppliedId(notificationId),
  })

  const gatewayStatus = message?.status?.type ?? 'UNKNOWN'
  const delivered: NotifStatus =
    gatewayStatus === 'DELIVERED' || gatewayStatus === 'SENT' || gatewayStatus === 'ACCEPTED'
      ? 'SENT'
      : 'QUEUED'

  // Same reasoning as dispatchEmail: this only runs after `smsProvider.send`
  // returned without throwing, so neither branch here is an error — clear the
  // 'in-flight' claim marker rather than leaving it stamped on a row that
  // actually went out (or is genuinely QUEUED pending delivery confirmation,
  // not stuck).
  await notificationRepo.update(notificationId, {
    status: delivered,
    sentAt: delivered === 'SENT' ? new Date() : null,
    errorMessage: null,
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

/** A notification that has run out of retries and will never be sent. */
export interface AbandonedNotifications {
  total: number
  byChannel: Record<string, number>
  /** One real error, so an alert can say *why* rather than only *how many*. */
  sampleError: string | null
  /** The most recent one, for the reader working out when this started. */
  latestAt: Date | null
}

/**
 * Notifications that have exhausted their retries.
 *
 * `requeueFailedNotifications` stops promoting a row once `retryCount` reaches
 * `MAX_RETRIES`, so from that moment it sits `FAILED` forever and nothing says
 * so. That is the quiet failure: the app is healthy, the jobs run, the queue
 * drains — and members simply stop being told their debit failed.
 *
 * Every cause lands here, which is the point of counting it rather than
 * guarding one of them: an unverifiable `RESEND_FROM_EMAIL`, a revoked API key,
 * a BulkSMS outage, a member with a malformed phone number.
 */
export async function countAbandonedNotifications(): Promise<AbandonedNotifications> {
  const where: Prisma.NotificationWhereInput = { status: 'FAILED', retryCount: { gte: MAX_RETRIES } }

  // The real count, never truncated. This used to come from `rows.length` on
  // a `findMany` capped at `take: 200` — accurate only as long as the true
  // backlog never crossed 200, and silently wrong forever after: a nightly
  // alert that read "200 notifications" whether the real number was 200 or
  // 2 000. `groupBy` with `_count` answers "how many" exactly, cheaply,
  // without fetching every row's data — it was measured against exactly this
  // backlog and found the real total, 229, when the old query had been
  // reporting 200 (see docs/production-readiness/03-notification-delivery-recovery.md §21.1).
  const counts = await notificationRepo.countByChannel(where)
  const byChannel: Record<string, number> = {}
  let total = 0
  for (const row of counts as unknown as Array<{ channel: string; _count: { _all: number } }>) {
    byChannel[row.channel] = row._count._all
    total += row._count._all
  }

  // A sample error and the most recent timestamp are examples, not facts
  // being reported as exhaustive — a small bounded fetch is the right tool
  // for these, unlike for `total`/`byChannel` above.
  const sample = await notificationRepo.findMany(where, {
    take: 50,
    orderBy: { updatedAt: 'desc' },
    select: { errorMessage: true, updatedAt: true },
  })
  const sampleRows = sample as unknown as Array<{ errorMessage: string | null; updatedAt: Date }>

  return {
    total,
    byChannel,
    sampleError: sampleRows.find((r) => r.errorMessage && r.errorMessage !== 'in-flight')?.errorMessage ?? null,
    latestAt: sampleRows[0]?.updatedAt ?? null,
  }
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
// Public: recover notifications orphaned mid-flush — a worker that died between
// the atomic claim (findReady) and the final status write leaves rows stuck
// 'in-flight' forever, which requeueFailedNotifications deliberately skips.
// Time-bounded so a batch actively being processed is never disturbed; a flush
// dispatches in well under a minute, so anything 'in-flight' this long is a
// crash orphan. Safe to requeue: email re-dispatch is idempotent (Resend key),
// so recovery never doubles an email; SMS re-dispatch carries the same
// userSuppliedId for provider-side correlation.
// ---------------------------------------------------------------------------

const STALE_INFLIGHT_MS = 15 * 60 * 1000

export async function recoverStalledNotifications(): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_INFLIGHT_MS)
  const result = await notificationRepo.recoverStalled(staleBefore)
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
