import { inngest } from '@/lib/inngest'
import {
  flushQueuedNotifications,
  requeueFailedNotifications,
  recoverStalledNotifications,
} from '@/services/notification.service'

export const notificationFlush = inngest.createFunction(
  {
    id: 'notification-flush',
    name: 'Notification Flush Worker',
    concurrency: {
      limit: 1, // one flush at a time — prevents duplicate sends under parallel Inngest replays
    },
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
