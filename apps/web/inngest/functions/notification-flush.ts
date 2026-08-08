import { inngest } from '@/lib/inngest'
import {
  flushQueuedNotifications,
  requeueFailedNotifications,
  recoverStalledNotifications,
} from '@/services/notification.service'
import { alertOnFailure } from '@/inngest/on-failure'

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

    // If we hit the batch ceiling there may be more — re-trigger immediately
    if (result.processed === 100) {
      await step.sendEvent('trigger-next-flush', {
        name: 'xxm/notifications.flush',
        data: {},
      })
    }

    return result
  },
)
