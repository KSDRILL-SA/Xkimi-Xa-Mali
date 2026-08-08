import { logger } from '@xxm/observability'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { emailProvider } from '@/integrations/email'
import { notifyAdmins } from '@/services/inbox.service'
import { queueNotification } from '@/services/notification.service'
import { writeAuditLog } from '@/services/audit.service'

/**
 * Telling a person that money did not move.
 *
 * Alerts already existed before this — the debit run announced an incomplete
 * collection, the morning sweep announced anomalies — but every one of them
 * ended at `notifyAdmins`, which writes an in-app inbox message and stops. On
 * debit night at 18:00, "nine contributions were not collected" was filed in a
 * web page nobody had a reason to open. The alert was raised; nobody was told.
 *
 * That is the same defect the statement notice had (#286) and it is worse here,
 * because the audience is four people who are not looking at a dashboard and the
 * runbook's own P1 definition is "money not moving on debit day — respond
 * immediately". An alert that waits for someone to log in cannot support that.
 *
 * So severity here decides *how far the message travels*, not how it is worded:
 *
 * - `critical` — money did not move, or the records disagree about money.
 *   Inbox, email **and** SMS. SMS costs, which is the point: it is reserved for
 *   the things worth waking someone for.
 * - `warning` — worth seeing today, not tonight. Inbox and email.
 *
 * Every alert is also written to the audit log and to the logger, so there is a
 * durable record independent of whether any channel actually delivered.
 */

export type AlertSeverity = 'critical' | 'warning'

export interface OperationalAlert {
  /** Stable machine name, e.g. `DEBIT_RUN_INCOMPLETE`. Also the audit action. */
  code: string
  severity: AlertSeverity
  /** One line. Becomes the SMS and the email subject, so keep it short. */
  title: string
  /** The detail. Newlines survive to the inbox and the email. */
  body: string
  /**
   * What the alert is about — a period key, a job id, a date. Only used to
   * group audit entries; it is not a foreign key.
   */
  entityId?: string
  /** Structured detail for the audit log. Never sent to a channel. */
  payload?: Record<string, unknown>
}

/** Admin-facing templates. Seeded, and inserted by migration for existing databases. */
const ADMIN_ALERT_SMS = 'admin-alert-sms'
const ADMIN_ALERT_EMAIL = 'admin-alert-email'

/**
 * Raise an alert through every channel its severity warrants.
 *
 * Never throws. An alert is raised *because* something already went wrong, and
 * a failure to deliver it must not become a second failure that takes down the
 * job reporting the first. Each channel is attempted independently, so a
 * BulkSMS outage does not also cost the email.
 */
export async function raiseOperationalAlert(alert: OperationalAlert): Promise<{
  admins: number
  inbox: boolean
  email: boolean
  sms: boolean
  /** Whether the account-independent destination took it. Critical alerts only. */
  fallback: boolean
}> {
  const result = { admins: 0, inbox: false, email: false, sms: false, fallback: false }

  // The log line first, and unconditionally. It is the only channel that does
  // not depend on the database being readable or a provider being reachable,
  // and `logger.error` is what puts a critical alert into Sentry.
  const log = alert.severity === 'critical' ? logger.error : logger.warn
  log(`Operational alert: ${alert.title}`, {
    code: alert.code,
    severity: alert.severity,
    detail: alert.body,
    ...alert.payload,
  })

  const admins = await attempt('find-admins', () =>
    db.user.findMany({
      where: { status: 'ACTIVE', roles: { some: { role: { name: 'ADMIN' } } } },
      select: { id: true },
    }),
  )
  result.admins = admins?.length ?? 0

  await attempt('audit', () =>
    writeAuditLog({
      action: alert.code,
      entity: 'System',
      entityId: alert.entityId ?? new Date().toISOString().slice(0, 10),
      payload: {
        severity: alert.severity,
        title: alert.title,
        detail: alert.body,
        ...alert.payload,
      },
    }),
  )

  const marker = alert.severity === 'critical' ? '🔴' : '⚠️'
  result.inbox =
    (await attempt('inbox', () =>
      notifyAdmins({ title: `${marker} ${alert.title}`, body: alert.body }),
    )) !== null

  // The standing destination, attempted for every critical alert regardless of
  // how the admin fan-out goes. See {@link deliverToFallback}.
  if (alert.severity === 'critical') {
    result.fallback = await deliverToFallback(alert)
  }

  if (!admins || admins.length === 0) {
    // Nothing to escalate to. Worth its own line: an alerting system with no
    // recipients looks identical to a quiet night from the outside.
    logger.error('Operational alert has no active admin to reach', {
      code: alert.code,
      severity: alert.severity,
      reachedFallback: result.fallback,
    })
    return result
  }

  // The payload every admin template renders. `interpolate` emits unsupplied
  // placeholders as literal braces, so both keys are always present.
  const payload = { title: alert.title, detail: alert.body }

  result.email = await fanOut(admins, ADMIN_ALERT_EMAIL, 'EMAIL', payload)

  if (alert.severity === 'critical') {
    result.sms = await fanOut(admins, ADMIN_ALERT_SMS, 'SMS', payload)
  }

  return result
}

/**
 * The destination that does not depend on anybody's account.
 *
 * Every other channel routes through a `User` row: find the active admins, queue
 * a notification against each, let the flush worker deliver it. That chain has
 * three links that can each be the reason nothing arrives — no active admin, a
 * suspended account, a flush worker that is itself the thing that died — and
 * this system currently runs with **one** admin, so none of those links has a
 * spare.
 *
 * `ALERT_FALLBACK_EMAIL` is a standing address: a shared operations mailbox, a
 * WhatsApp-to-email bridge, whatever is monitored by more than one person. It is
 * sent **directly**, not queued, for the same reason — if the queue is what
 * broke, putting the alert about it into the queue is not a plan.
 *
 * Optional. Unset, this is a no-op and the admin fan-out is the whole story,
 * which is exactly the behaviour before this existed.
 */
async function deliverToFallback(alert: OperationalAlert): Promise<boolean> {
  const to = env.ALERT_FALLBACK_EMAIL
  if (!to) return false

  const sent = await attempt('fallback-email', () =>
    emailProvider.sendGenericEmail(
      to,
      `Action needed: ${alert.title}`,
      `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">` +
        `<h2 style="margin:0 0 16px;">${escapeHtml(alert.title)}</h2>` +
        `<pre style="white-space:pre-wrap;font-family:inherit;margin:0 0 24px;">${escapeHtml(alert.body)}</pre>` +
        `<p style="color:#666;font-size:13px;margin:0;">Automated operational alert (${escapeHtml(alert.code)}) ` +
        `from the Xkimm Xa Mali Foundation system.</p></div>`,
      // Not an idempotency key Resend can dedupe on across runs — the code and
      // the entity are what make two alerts the same alert.
      `alert:${alert.code}:${alert.entityId ?? ''}`,
    ),
  )

  return sent !== null
}

/**
 * The alert title and body are assembled from job output — a gateway's failure
 * string, a Prisma error. None of it is authored by a person, and all of it is
 * about to be interpolated into HTML.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Queue one template to every admin, reporting whether any were queued.
 *
 * One admin's failure does not stop the others: with four founders, the one
 * whose row is malformed must not be the reason the other three hear nothing.
 */
async function fanOut(
  admins: Array<{ id: string }>,
  templateSlug: string,
  channel: 'SMS' | 'EMAIL',
  payload: Record<string, unknown>,
): Promise<boolean> {
  const results = await Promise.all(
    admins.map((admin) =>
      attempt(`${channel.toLowerCase()}-${admin.id}`, () =>
        queueNotification({ userId: admin.id, templateSlug, channel, payload }),
      ),
    ),
  )
  return results.some((r) => r !== null)
}

/** Run a delivery attempt, logging and swallowing its failure. Null on failure. */
async function attempt<T>(what: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (err) {
    logger.error('Operational alert channel failed', {
      channel: what,
      reason: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}
