import { db } from '@/lib/db'
import { logger } from '@xxm/observability'

/**
 * Proof that a scheduled job is still running at all.
 *
 * Everything this system says about jobs, it says from inside one. `onFailure`
 * speaks when a run exhausts its retries. The debit run speaks when a
 * collection is declined. `NOTIFICATIONS_ABANDONED` speaks when a message gives
 * up. All three require the job to have been invoked.
 *
 * Nothing speaks when a job is never invoked — an Inngest app that failed to
 * sync after a deploy, a function disabled in the dashboard, a registration
 * dropped from `inngest/index.ts`, an expired signing key. There is no error to
 * report and no failed row to find, so the system looks exactly as it does on a
 * quiet night. On the 25th at 18:00 that is every member uncollected, with a
 * green health check.
 *
 * So each watched job writes a row when it finishes, and `job-heartbeat-check`
 * reads them. The heartbeat is written *last*, which makes it mean "this run
 * reached the end" rather than "this run started".
 */

export interface WatchedJob {
  /** The Inngest function id. Also the primary key of the heartbeat row. */
  jobId: string
  /** What a person should read in an SMS. "The monthly debit run", not `debit-run`. */
  label: string
  /**
   * How long this job may stay silent before that silence is itself the alarm.
   *
   * Set from the cron interval plus a cushion for retries and a slow run — not
   * tight to the schedule, because a heartbeat check that cries wolf gets
   * muted, and a muted alarm is the state this whole mechanism exists to
   * prevent.
   */
  maxSilenceMinutes: number
  /** What is actually lost while this job is not running. Goes into the alert body. */
  consequence: string
}

/** Daily jobs: 24h plus a two-hour cushion. */
const DAILY = 26 * 60

/**
 * The jobs whose silence costs money, and nothing else.
 *
 * A job earns a place here by the §4.6 test — grep it for the gateway, the
 * transaction writes and the mandate writes — not by being important-sounding.
 * The other twelve are deliberately absent: a badge recalculation that skips a
 * month is a badge recalculation that runs next month.
 *
 * `mandate-delay-handler` is absent for a different reason. It is triggered by
 * `xxm/mandate.delay-handler`, not by a cron, so a month in which no member
 * moves a debit date is a month in which it correctly never runs. There is no
 * expected interval to measure it against and a heartbeat would only ever
 * produce false alarms.
 */
export const WATCHED_JOBS: readonly WatchedJob[] = [
  {
    jobId: 'debit-run',
    label: 'The monthly debit run',
    // Runs daily and collects the mandates whose debit day is today, so a
    // single missed day is a whole cohort of members uncollected for the month.
    maxSilenceMinutes: DAILY,
    consequence: 'No contributions are being collected.',
  },
  {
    jobId: 'transaction-retry-failed',
    label: 'The failed-transaction retry',
    maxSilenceMinutes: DAILY,
    consequence: 'Failed collections are not being retried and stay failed.',
  },
  {
    jobId: 'ledger-reconciliation',
    label: 'Nightly ledger reconciliation',
    maxSilenceMinutes: DAILY,
    consequence: 'Ledger drift is accumulating unchecked.',
  },
  {
    jobId: 'mandate-status-sync',
    label: 'Mandate status reconciliation',
    // The debit run collects only from ACTIVE mandates. Stale statuses mean
    // members are skipped without anything recording that they were.
    maxSilenceMinutes: DAILY,
    consequence: 'Mandate statuses are stale, so the debit run may skip members.',
  },
  {
    jobId: 'notification-flush',
    label: 'The notification flush worker',
    // Cron is every five minutes. Thirty allows six missed runs before this is
    // treated as more than a blip.
    maxSilenceMinutes: 30,
    consequence:
      'Nothing is being delivered to anyone, including these alerts. ' +
      'NOTIFICATIONS_ABANDONED cannot fire either, because a message that is never attempted never exhausts its retries.',
  },
  {
    jobId: 'job-heartbeat-check',
    label: 'The job heartbeat check',
    // Watched by itself, which cannot catch its own absence — a dead watcher
    // raises nothing, by definition. What this row does buy: a gap that ended
    // is reported on the next run, and `/api/v1/health` can be read from
    // outside Inngest entirely to see whether the watcher is beating. Closing
    // it properly needs an external ping; see docs/runbook.md.
    maxSilenceMinutes: 60,
    consequence: 'Job liveness is no longer being checked by anything.',
  },
] as const

/** A watched job and how long it has been quiet. `lastRunAt` null means never. */
export interface OverdueJob {
  jobId: string
  label: string
  consequence: string
  maxSilenceMinutes: number
  lastRunAt: string | null
  silentMinutes: number | null
}

/** What `readHeartbeats` returns: dates as ISO strings, so a memoised step replays identically. */
export interface HeartbeatReading {
  jobId: string
  lastRunAt: string | null
}

/**
 * Record that a job reached the end of a run.
 *
 * **Never throws.** This is called as the last step of the debit run, after
 * money has moved. A failed heartbeat write must not fail the run that just
 * collected a month of contributions — the observability mechanism becoming a
 * failure mode for the money path is a worse bug than the one it was added to
 * find (§2.1).
 *
 * Swallowing is safe in the direction that matters: a write that silently fails
 * leaves the row stale, and a stale row is what the checker alerts on. The
 * failure mode of this function is a false alarm, never a missed one.
 */
export async function recordJobHeartbeat(jobId: string, now: Date = new Date()): Promise<void> {
  try {
    await db.jobHeartbeat.upsert({
      where: { jobId },
      create: { jobId, lastRunAt: now },
      update: { lastRunAt: now },
    })
  } catch (err) {
    logger.error('Failed to record a job heartbeat', {
      jobId,
      reason: err instanceof Error ? err.message : String(err),
    })
  }
}

/** Read every watched job's last beat. Dates are serialised for step memoisation. */
export async function readHeartbeats(): Promise<HeartbeatReading[]> {
  const rows = await db.jobHeartbeat.findMany({
    where: { jobId: { in: WATCHED_JOBS.map((job) => job.jobId) } },
    select: { jobId: true, lastRunAt: true },
  })

  const byId = new Map(rows.map((row) => [row.jobId, row.lastRunAt]))

  return WATCHED_JOBS.map((job) => ({
    jobId: job.jobId,
    lastRunAt: byId.get(job.jobId)?.toISOString() ?? null,
  }))
}

/**
 * Decide which jobs have been quiet too long. Pure, so the checker can compute
 * it outside `step.run` and a test can drive it without a database.
 *
 * **A job with no heartbeat row is overdue, not fine.** This is the C-2 lesson
 * in a new place: there, a missing Redis key read as version 0 and a revoked
 * admin kept their powers, because absent evidence was treated as good news. A
 * job that has never once written a heartbeat is the single most likely shape
 * of the failure this mechanism exists to catch — it was never registered at
 * all. The migration seeds a row for every job watched at the time, so this
 * path is reached by a *newly* watched job, which alerts once and clears on its
 * first run.
 */
export function computeOverdue(
  readings: readonly HeartbeatReading[],
  now: Date = new Date(),
): OverdueJob[] {
  const overdue: OverdueJob[] = []

  for (const job of WATCHED_JOBS) {
    const reading = readings.find((r) => r.jobId === job.jobId)
    const lastRunAt = reading?.lastRunAt ?? null

    if (lastRunAt === null) {
      overdue.push({
        jobId: job.jobId,
        label: job.label,
        consequence: job.consequence,
        maxSilenceMinutes: job.maxSilenceMinutes,
        lastRunAt: null,
        silentMinutes: null,
      })
      continue
    }

    const silentMs = now.getTime() - new Date(lastRunAt).getTime()
    const silentMinutes = Math.floor(silentMs / 60_000)
    if (silentMinutes > job.maxSilenceMinutes) {
      overdue.push({
        jobId: job.jobId,
        label: job.label,
        consequence: job.consequence,
        maxSilenceMinutes: job.maxSilenceMinutes,
        lastRunAt,
        silentMinutes,
      })
    }
  }

  return overdue
}
