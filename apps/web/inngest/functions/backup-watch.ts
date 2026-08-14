import { inngest } from '@/lib/inngest'
import { checkBackupFreshness, MAX_BACKUP_AGE_HOURS } from '@/services/backup-watch.service'
import { raiseOperationalAlert } from '@/services/alert.service'
import { recordJobHeartbeat } from '@/lib/job-heartbeat'
import { logger } from '@xxm/observability'

/**
 * The dead-man's switch on the off-platform backup.
 *
 * Every other backup alert is raised by the backup workflow, which means every
 * one of them needs that workflow to have run. GitHub disables scheduled
 * workflows after roughly 60 days of repository inactivity, and a disabled
 * schedule produces no run, no failure and no alert — the backup simply stops,
 * and the last thing anyone heard was a success.
 *
 * This runs in the app, on the app's own schedule, and so keeps asking the
 * question after GitHub has stopped answering it on its own.
 *
 * Daily at 08:00 SAST, a few hours after the 03:30 backup, so a night that
 * failed is reported the same morning rather than a day later.
 */
export const backupWatch = inngest.createFunction(
  { id: 'backup-watch', name: 'Off-platform Backup Watch' },
  { cron: '0 6 * * *' }, // 08:00 SAST (UTC+2)
  async ({ step }) => {
    const status = await step.run('check', () => checkBackupFreshness())

    if (status.state === 'stale') {
      const howLong =
        status.lastSuccessAt === null
          ? 'The Backup workflow has never completed successfully.'
          : `The last successful backup was ${Math.floor(status.ageHours ?? 0)} hours ago (${status.lastSuccessAt.slice(0, 10)}).`

      await step.run('alert-stale', () =>
        raiseOperationalAlert({
          code: 'BACKUP_NOT_RUNNING',
          // Critical, and this is the exception that proves the money rule: no
          // money moves tonight because of this, but it is the only alert whose
          // subject is whether the Foundation's records still exist anywhere but
          // one vendor's account. If the answer is no, every hour it stays no is
          // a bad hour.
          severity: 'critical',
          title: 'Off-platform backup has stopped',
          body: [
            howLong,
            '',
            'The backup workflow cannot report this itself — if it is not being',
            'scheduled, it never runs, so it never alerts. GitHub disables',
            'scheduled workflows after about 60 days without repository activity,',
            'which is the most likely cause.',
            '',
            'Open Actions in the repository. If the schedule is disabled, re-enable',
            'it and run Backup by hand to confirm, then see docs/backup-and-restore.md.',
          ].join('\n'),
          entityId: new Date().toISOString().slice(0, 10),
          payload: { lastSuccessAt: status.lastSuccessAt, ageHours: status.ageHours },
        }),
      )
    } else if (status.state === 'unknown') {
      // Not an alarm about the backup — an alarm about not being able to see it.
      // Reported at `warning` and worded so nobody reads it as "the backup has
      // stopped", because the two need different first moves and this one is
      // frequently just GitHub having a bad morning.
      await step.run('alert-unknown', () =>
        raiseOperationalAlert({
          code: 'BACKUP_WATCH_BLIND',
          severity: 'warning',
          title: 'Cannot confirm the backup is running',
          body: [
            'This is not a report that the backup has failed. It is a report that',
            'the backup could not be checked, which is a different thing.',
            '',
            status.reason,
            '',
            'If this repeats for more than a day or two, check it by hand:',
            'the repository Actions tab shows when Backup last ran.',
          ].join('\n'),
          entityId: new Date().toISOString().slice(0, 10),
          payload: { reason: status.reason },
        }),
      )
    }

    // On every path, including the ones that alerted. The beat says this check
    // reached the end, not that it liked what it found.
    await step.run('heartbeat', () => recordJobHeartbeat('backup-watch'))

    logger.info('Backup watch completed', {
      state: status.state,
      maxAgeHours: MAX_BACKUP_AGE_HOURS,
    })
    return { state: status.state }
  },
)
