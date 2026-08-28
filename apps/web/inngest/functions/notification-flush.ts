import { inngest } from '@/lib/inngest'
import {
  flushQueuedNotifications,
  requeueFailedNotifications,
  recoverStalledNotifications,
  countAbandonedNotifications,
} from '@/services/notification.service'
import { auditRepo } from '@/repositories/audit.repository'
import { raiseOperationalAlert } from '@/services/alert.service'
import { alertOnFailure } from '@/inngest/on-failure'
import { recordJobHeartbeat } from '@/lib/job-heartbeat'

/** The audit action the alert writes, and therefore what it throttles on. */
const ABANDONED_ALERT_ACTION = 'NOTIFICATIONS_ABANDONED'

/**
 * How long to stay quiet after saying it once.
 *
 * This job runs every five minutes. Without a window it would raise the same
 * alert 288 times a day, which is not an alert — it is a reason to mute the
 * channel it arrives on.
 */
const ALERT_QUIET_HOURS = 6

/**
 * Say so when notifications have stopped arriving.
 *
 * `requeueFailedNotifications` stops promoting a row once it has exhausted its
 * retries, so from that moment it sits FAILED forever. Nothing said anything:
 * the app was healthy, the jobs ran, the queue drained, and members simply
 * stopped being told their debit had failed. It is the quietest failure in the
 * system and it was the one nobody would have found.
 *
 * Every cause lands in the same place, which is why this counts abandoned rows
 * rather than guarding any one of them — a from-address Resend will not send
 * from, a revoked API key, a BulkSMS outage, one malformed phone number.
 *
 * **Throttled on the audit log, deliberately not on Redis.** The cache client is
 * a no-op shim whenever Upstash is unconfigured: every read returns null, so a
 * Redis throttle fails *open* and sends on every run. This codebase already
 * learned that with the reminder jobs; the audit row is durable evidence and
 * cannot fail open.
 */
export type FlushStepRunner = {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>
}

export async function reportAbandonedNotifications(step: FlushStepRunner): Promise<
  { abandoned: number; alerted: boolean }
> {
  const abandoned = await step.run('count-abandoned', () => countAbandonedNotifications())
  if (abandoned.total === 0) return { abandoned: 0, alerted: false }

  const alerted = await step.run('alert-abandoned', async () => {
    const since = new Date(Date.now() - ALERT_QUIET_HOURS * 60 * 60 * 1000)
    const alreadySaid = await auditRepo.count({
      action: ABANDONED_ALERT_ACTION,
      createdAt: { gte: since },
    })
    if (alreadySaid > 0) return false

    const channels = Object.entries(abandoned.byChannel)
      .map(([channel, count]) => `${count} ${channel}`)
      .join(', ')

    await raiseOperationalAlert({
      code: ABANDONED_ALERT_ACTION,
      // Members are not being told things this system promised to tell them,
      // and one of those things is that their money did not move.
      severity: 'critical',
      // Plain ASCII and short: this goes out as an SMS.
      title: `${abandoned.total} notifications gave up and will never send`,
      body: [
        `${abandoned.total} notification${abandoned.total === 1 ? '' : 's'} exhausted every retry and ` +
          'will not be sent. Members are not being told things this system promised to tell them.',
        '',
        `By channel: ${channels}`,
        abandoned.sampleError ? `Example error: ${abandoned.sampleError}` : '',
        // `abandoned` crossed a `step.run` boundary above — Inngest persists
        // step results as JSON, so `latestAt` comes back a string, not the
        // `Date` the service returned. `new Date(...)` accepts either.
        abandoned.latestAt ? `Most recent: ${new Date(abandoned.latestAt).toISOString()}` : '',
        '',
        'Common causes: RESEND_FROM_EMAIL on a domain Resend cannot verify, a revoked',
        'provider key, or a provider outage. Check the notifications table for the',
        'stored errorMessage, fix the cause, then reset retryCount to requeue them.',
      ]
        .filter(Boolean)
        .join('\n'),
      entityId: new Date().toISOString().slice(0, 10),
      payload: { total: abandoned.total, byChannel: abandoned.byChannel, sampleError: abandoned.sampleError },
    })

    return true
  })

  return { abandoned: abandoned.total, alerted }
}

export const notificationFlush = inngest.createFunction(
  {
    id: 'notification-flush',
    name: 'Notification Flush Worker',
    concurrency: {
      limit: 1, // one flush at a time — prevents duplicate sends under parallel Inngest replays
    },
    // The awkward one: this job is what delivers alerts, so its own alert
    // cannot be delivered by it. Queueing the SMS and the email is still worth
    // doing — the failure may be transient and the next run drains the queue —
    // but what actually carries this one out of the building is the
    // `logger.error` inside the alert service, which reaches Sentry directly.
    // Nothing else in this system tells you that notifications have stopped.
    onFailure: alertOnFailure('The notification flush worker'),
  },
  [
    { event: 'xxm/notifications.flush' },
    { cron: '*/5 * * * *' }, // also poll every 5 minutes as a safety net
  ],
  async ({ step }) => {
    // Recover any batch orphaned 'in-flight' by a previously crashed worker,
    // then promote eligible FAILED notifications back to QUEUED, before flushing.
    await step.run('recover-stalled', () => recoverStalledNotifications())
    await step.run('requeue-failed', () => requeueFailedNotifications())

    const result = await step.run('flush-queued', () =>
      flushQueuedNotifications(100),
    )

    // After the flush, not before: a row that just exhausted its last retry is
    // abandoned from this moment, and waiting five minutes to notice would be a
    // choice rather than an accident.
    const abandoned = await reportAbandonedNotifications(step as unknown as FlushStepRunner)

    // This worker delivers every alert in the system, so its own silence is the
    // one that disables the rest. It cannot report that itself — which is the
    // point of writing the beat somewhere another job can read it.
    await step.run('heartbeat', () => recordJobHeartbeat('notification-flush'))

    // If we hit the batch ceiling there may be more — re-trigger immediately
    if (result.processed === 100) {
      await step.sendEvent('trigger-next-flush', {
        name: 'xxm/notifications.flush',
        data: {},
      })
    }

    return { ...result, ...abandoned }
  },
)
