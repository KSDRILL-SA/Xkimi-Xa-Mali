import { logger } from '@xxm/observability'
import { db } from '@/lib/db'
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
}> {
  const result = { admins: 0, inbox: false, email: false, sms: false }

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

  if (!admins || admins.length === 0) {
    // Nothing to escalate to. Worth its own line: an alerting system with no
    // recipients looks identical to a quiet night from the outside.
    logger.error('Operational alert has no active admin to reach', {
      code: alert.code,
      severity: alert.severity,
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
