import { logger } from '@xxm/observability'
import { db } from '@/lib/db'
import { notifyAdmins } from '@/services/inbox.service'
import { writeAuditLog } from '@/services/audit.service'

/**
 * Telling a person that money did not move — in-app, and only in-app.
 *
 * Alerts already existed before this — the debit run announced an incomplete
 * collection, the morning sweep announced anomalies — but every one of them
 * ended at `notifyAdmins`, which writes an in-app inbox message and stops.
 *
 * This used to also queue an email to every admin, and a critical alert to a
 * standing fallback address besides, on the reasoning that a page nobody has
 * a reason to open is the same as not being told. It stopped being that once
 * the same channel-exhaustion problem this alert exists to report started
 * showing up *in* the alert: `requeueFailedNotifications`'s BulkSMS-quota
 * revival (see notification.service.ts) resurrected a batch of stale,
 * days-old `admin-alert-sms` rows queued under the pre-SMS-removal design,
 * and they went out — alongside their still-live `admin-alert-email`
 * sibling — the moment the quota came back. The owner got a text about an
 * incident that may already be resolved, with no context and no way to tell
 * it apart from a current one. Email and SMS are both queued, both retried,
 * both able to sit around and fire later than the thing they describe is
 * still true. The inbox is written directly, right now, by this call, or not
 * at all — it cannot arrive stale.
 *
 * By explicit owner decision: operational alerts are in-app only. No SMS, no
 * email, for any severity. Severity still decides how the inbox row reads —
 * 🔴 for `critical`, ⚠️ for `warning` — just not how many channels fire.
 *
 * Every alert is also written to the audit log and to the logger, so there is
 * a durable record independent of whether the inbox write itself succeeds.
 */

export type AlertSeverity = 'critical' | 'warning'

export interface OperationalAlert {
  /** Stable machine name, e.g. `DEBIT_RUN_INCOMPLETE`. Also the audit action. */
  code: string
  severity: AlertSeverity
  /** One line, shown as the inbox row's title. */
  title: string
  /** The detail. Newlines survive to the inbox. */
  body: string
  /**
   * What the alert is about — a period key, a job id, a date. Only used to
   * group audit entries; it is not a foreign key.
   */
  entityId?: string
  /** Structured detail for the audit log. Never sent to a channel. */
  payload?: Record<string, unknown>
}

/**
 * Raise an alert: log it, audit it, and write it to every active admin's inbox.
 *
 * Never throws. An alert is raised *because* something already went wrong, and
 * a failure to deliver it must not become a second failure that takes down the
 * job reporting the first.
 */
export async function raiseOperationalAlert(alert: OperationalAlert): Promise<{
  admins: number
  inbox: boolean
}> {
  const result = { admins: 0, inbox: false }

  // The log line first, and unconditionally. It is the only channel that does
  // not depend on the database being readable, and `logger.error` is what
  // puts a critical alert into Sentry.
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
  }

  return result
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
