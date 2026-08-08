import { inngest } from '@/lib/inngest'
import { logger } from '@xxm/observability'
import { auditRepo } from '@/repositories/audit.repository'
import { raiseOperationalAlert } from '@/services/alert.service'
import { alertOnFailure } from '@/inngest/on-failure'
import {
  WATCHED_JOBS,
  readHeartbeats,
  computeOverdue,
  recordJobHeartbeat,
  type OverdueJob,
} from '@/lib/job-heartbeat'

/**
 * Say so when a job has stopped running.
 *
 * This is the one alert in the system that is not raised by the thing it is
 * about. Every other one requires the job to have been invoked: `onFailure`
 * needs a run that failed, `DEBIT_RUN_INCOMPLETE` needs a debit run that
 * reached the end, `NOTIFICATIONS_ABANDONED` needs a flush worker that counted.
 * A job that is never invoked produces none of them, and produces no error
 * either — the system is healthy, the queue is empty, the logs are clean, and
 * nobody is being collected.
 *
 * **`SCHEDULED_JOB_SILENT`, deliberately not `SCHEDULED_JOB_FAILED`.** They are
 * different failures with different first moves. A failed job has a run in the
 * Inngest dashboard with a stack trace at the end of it. A silent job has no run
 * to look at, and the question is whether the app is registered at all — a
 * failed sync after a deploy, a disabled function, a bad signing key. Sending
 * both under one code would put the wrong instruction in front of whoever is
 * reading it at 18:20 on debit night.
 */

/** The audit action the alert writes, and therefore what it throttles on. */
const SILENT_ALERT_ACTION = 'SCHEDULED_JOB_SILENT'

/**
 * How long to stay quiet after saying it once — but see {@link shouldStayQuiet}.
 * The window is not the whole rule, because a second job going silent during it
 * is news.
 */
const ALERT_QUIET_HOURS = 6

export type HeartbeatStepRunner = {
  run<T>(id: string, fn: () => Promise<T> | T): Promise<T>
}

/**
 * Whether this exact set of silent jobs has already been reported recently.
 *
 * Throttling on time alone would mask the case that matters most: reconciliation
 * has been quiet for four hours, the alert went out, and now the debit run has
 * stopped too. That second failure is worth an SMS immediately, and a plain
 * six-hour window would swallow it until the window expired.
 *
 * So the window applies only while the set is unchanged. Any job joining it
 * speaks at once. A job *leaving* the set also counts as a change, which is
 * mildly chatty — a recovery followed by a relapse re-alerts — and that is the
 * side to err on.
 *
 * **Throttled on the audit log, not on Redis**, for the reason recorded in
 * `notification-flush`: the cache client is a no-op shim whenever Upstash is
 * unconfigured, so every read returns null and a Redis throttle fails *open*.
 * Here it would fail open on an alert that repeats every fifteen minutes.
 */
async function shouldStayQuiet(overdue: readonly OverdueJob[]): Promise<boolean> {
  const since = new Date(Date.now() - ALERT_QUIET_HOURS * 60 * 60 * 1000)

  const recent = await auditRepo.findMany(
    { action: SILENT_ALERT_ACTION, createdAt: { gte: since } },
    { take: 1, orderBy: { createdAt: 'desc' } },
  )

  const last = recent[0]
  if (!last) return false

  const payload = last.payload as { jobs?: unknown } | null
  const said = Array.isArray(payload?.jobs) ? payload.jobs.map(String).sort() : null
  if (said === null) return false

  const now = overdue.map((job) => job.jobId).sort()
  return said.length === now.length && said.every((jobId, i) => jobId === now[i])
}

/** How long a job has been quiet, in words rather than minutes. */
function describeSilence(job: OverdueJob): string {
  if (job.silentMinutes === null) return 'has never run'
  if (job.silentMinutes < 120) return `last ran ${job.silentMinutes} minutes ago`
  return `last ran ${Math.floor(job.silentMinutes / 60)} hours ago`
}

export async function executeJobHeartbeatCheck(
  step: HeartbeatStepRunner,
  now: Date = new Date(),
) {
  const readings = await step.run('read-heartbeats', () => readHeartbeats())

  // Outside `step.run`, and it matters. A completed step is not executed again
  // when Inngest re-enters the function — its recorded value is returned — so a
  // count accumulated inside one stops climbing after the first pass and the run
  // reports having found nothing while having found everything. This shipped
  // once already, in `ledger-reconciliation`.
  const overdue = computeOverdue(readings, now)

  let alerted = false

  if (overdue.length > 0) {
    alerted = await step.run('alert-silent-jobs', async () => {
      if (await shouldStayQuiet(overdue)) return false

      const plural = overdue.length === 1 ? '' : 's'
      const lines = overdue.map(
        (job) => `${job.label} ${describeSilence(job)}. ${job.consequence}`,
      )

      await raiseOperationalAlert({
        code: SILENT_ALERT_ACTION,
        // Always critical. A job is on the watched list only because its silence
        // costs money; that judgement was made when it was added, not here.
        severity: 'critical',
        // Plain ASCII, no emoji, no dash: this goes out as an SMS, where either
        // one halves the characters per segment.
        title:
          overdue.length === 1 && overdue[0]
            ? `Job not running: ${overdue[0].label}`
            : `${overdue.length} scheduled job${plural} have stopped running`,
        body: [
          `${overdue.length} scheduled job${plural} ${overdue.length === 1 ? 'has' : 'have'} not run within the time ${overdue.length === 1 ? 'it is' : 'they are'} expected to.`,
          '',
          ...lines,
          '',
          'Nothing failed. These jobs were never invoked, so there is no failed run',
          'to find. Check that the Inngest app is synced and the functions are',
          'enabled, then see docs/runbook.md.',
        ].join('\n'),
        entityId: now.toISOString().slice(0, 10),
        // `jobs` is what the throttle above reads back. Keep it a flat array of
        // ids: a shape change here silently disables the set comparison.
        payload: {
          jobs: overdue.map((job) => job.jobId),
          detail: overdue.map((job) => ({
            jobId: job.jobId,
            lastRunAt: job.lastRunAt,
            silentMinutes: job.silentMinutes,
            maxSilenceMinutes: job.maxSilenceMinutes,
          })),
        },
      })

      return true
    })
  }

  // Last, so the beat means this check reached the end — and after the read
  // above, so it is never clearing its own staleness before measuring it.
  await step.run('heartbeat', () => recordJobHeartbeat('job-heartbeat-check', now))

  const summary = {
    watched: WATCHED_JOBS.length,
    overdue: overdue.length,
    jobs: overdue.map((job) => job.jobId),
    alerted,
  }

  logger.info('Job heartbeat check completed', summary)
  return summary
}

export const jobHeartbeatCheck = inngest.createFunction(
  {
    id: 'job-heartbeat-check',
    name: 'Scheduled Job Heartbeat Check',
    // It cannot catch its own absence, but it can still fail while running,
    // and that is worth the same alert as any other watcher going dark.
    onFailure: alertOnFailure('The job heartbeat check'),
  },
  // Every fifteen minutes. The tightest window it watches is the flush worker's
  // thirty, so a quarter-hour keeps detection well inside it without turning a
  // liveness check into a meaningful share of the Inngest invocation budget.
  { cron: '*/15 * * * *' },
  ({ step }) => executeJobHeartbeatCheck(step as unknown as HeartbeatStepRunner),
)
