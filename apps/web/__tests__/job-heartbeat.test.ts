import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The failure with nothing to look at.
 *
 * Every other alert in this system is raised by the job it is about, which
 * means every one of them needs that job to have run. A job that is never
 * invoked at all — an app that failed to sync, a function disabled in the
 * dashboard, a registration dropped from the serve route — produces no error,
 * no failed row, and no alert. From the outside it is indistinguishable from a
 * quiet month, and on debit night it is every member uncollected.
 */

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  findMany: vi.fn(),
  auditFindMany: vi.fn(),
  raiseAlert: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: {} }))
vi.mock('@/lib/inngest', () => ({ inngest: { createFunction: () => ({}) } }))
vi.mock('@/lib/db', () => ({
  db: { jobHeartbeat: { upsert: mocks.upsert, findMany: mocks.findMany } },
}))
vi.mock('@/repositories/audit.repository', () => ({
  auditRepo: { findMany: mocks.auditFindMany },
}))
vi.mock('@/services/alert.service', () => ({ raiseOperationalAlert: mocks.raiseAlert }))
vi.mock('@/inngest/on-failure', () => ({ alertOnFailure: () => vi.fn() }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: mocks.logError },
}))

import {
  WATCHED_JOBS,
  computeOverdue,
  recordJobHeartbeat,
  readHeartbeats,
  type HeartbeatReading,
} from '@/lib/job-heartbeat'
import { executeJobHeartbeatCheck } from '@/inngest/functions/job-heartbeat-check'

const NOW = new Date('2026-08-08T18:00:00Z')

/** Runs every step body, as the first invocation of a run does. */
const step = { run: async <T>(_id: string, fn: () => Promise<T> | T): Promise<T> => fn() }

/**
 * Inngest on re-entry: a completed step returns its recorded value and its body
 * is never executed again. The §4.6 lesson — a stub that always executes passes
 * with a counter-inside-a-step bug still in place.
 */
function memoisingStep() {
  const done = new Map<string, unknown>()
  return {
    executed: [] as string[],
    run: async function <T>(this: { executed: string[] }, id: string, fn: () => Promise<T> | T): Promise<T> {
      if (done.has(id)) return done.get(id) as T
      this.executed.push(id)
      const value = await fn()
      done.set(id, value)
      return value
    },
  }
}

/** Every watched job beating just now, so a test can make exactly one of them stale. */
function allHealthy(): HeartbeatReading[] {
  return WATCHED_JOBS.map((job) => ({ jobId: job.jobId, lastRunAt: NOW.toISOString() }))
}

function minutesAgo(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString()
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.upsert.mockResolvedValue({})
  mocks.findMany.mockResolvedValue([])
  mocks.auditFindMany.mockResolvedValue([])
  mocks.raiseAlert.mockResolvedValue(undefined)
})

describe('deciding that a job has stopped', () => {
  it('treats a job with no heartbeat at all as overdue, not as fine', () => {
    // The C-2 lesson in a new place: there, a missing Redis key read as version
    // 0 and a revoked admin kept every power in their session. Absent evidence
    // is not good news. A job that has never written a heartbeat is the most
    // likely shape of the failure this exists to catch — it was never
    // registered at all.
    const readings = allHealthy().filter((r) => r.jobId !== 'debit-run')

    const overdue = computeOverdue(readings, NOW)

    expect(overdue.map((j) => j.jobId)).toEqual(['debit-run'])
    expect(overdue[0]?.lastRunAt).toBeNull()
    expect(overdue[0]?.silentMinutes).toBeNull()
  })

  it('says nothing when every job has beaten recently', () => {
    expect(computeOverdue(allHealthy(), NOW)).toEqual([])
  })

  it('flags a daily job that has been quiet for more than a day and its cushion', () => {
    const readings = allHealthy().map((r) =>
      r.jobId === 'ledger-reconciliation' ? { ...r, lastRunAt: minutesAgo(27 * 60) } : r,
    )

    const overdue = computeOverdue(readings, NOW)

    expect(overdue.map((j) => j.jobId)).toEqual(['ledger-reconciliation'])
    expect(overdue[0]?.silentMinutes).toBe(27 * 60)
  })

  it('leaves a daily job alone inside its cushion, so a slow run is not an alarm', () => {
    // 25 hours: past the 24-hour schedule, inside the 26-hour window. A check
    // that fires on every late run is a check that gets muted.
    const readings = allHealthy().map((r) =>
      r.jobId === 'ledger-reconciliation' ? { ...r, lastRunAt: minutesAgo(25 * 60) } : r,
    )

    expect(computeOverdue(readings, NOW)).toEqual([])
  })

  it('holds the flush worker to a much tighter window than the daily jobs', () => {
    // It runs every five minutes and it is what delivers every alert, including
    // these ones. An hour of silence there is not comparable to an hour of
    // silence from a nightly reconciliation.
    const readings = allHealthy().map((r) =>
      r.jobId === 'notification-flush' ? { ...r, lastRunAt: minutesAgo(45) } : r,
    )

    expect(computeOverdue(readings, NOW).map((j) => j.jobId)).toEqual(['notification-flush'])
  })
})

describe('what the alert says', () => {
  it('raises a critical alert naming the job and what is being lost', async () => {
    mocks.findMany.mockResolvedValue(
      WATCHED_JOBS.filter((j) => j.jobId !== 'debit-run').map((j) => ({
        jobId: j.jobId,
        lastRunAt: NOW,
      })),
    )

    const result = await executeJobHeartbeatCheck(step, NOW)

    expect(result).toMatchObject({ overdue: 1, jobs: ['debit-run'], alerted: true })
    const alert = mocks.raiseAlert.mock.calls[0][0]
    expect(alert).toMatchObject({ code: 'SCHEDULED_JOB_SILENT', severity: 'critical' })
    expect(alert.title).toContain('The monthly debit run')
    expect(alert.body).toContain('No contributions are being collected.')
    // The instruction has to differ from a failed job's: there is no failed run
    // to open, which is the whole difference between the two codes.
    expect(alert.body).toContain('never invoked')
  })

  it('does not reuse SCHEDULED_JOB_FAILED, which means something else', async () => {
    // A failed job has a run in the dashboard with a stack trace at the end of
    // it. A silent job has nothing to open, and the question is whether the app
    // is registered at all. One code for both puts the wrong first move in
    // front of whoever is reading it at 18:20.
    mocks.findMany.mockResolvedValue([])

    await executeJobHeartbeatCheck(step, NOW)

    expect(mocks.raiseAlert.mock.calls[0][0].code).not.toBe('SCHEDULED_JOB_FAILED')
  })

  it('keeps the title free of characters that cost an SMS segment', async () => {
    mocks.findMany.mockResolvedValue([])

    await executeJobHeartbeatCheck(step, NOW)

    expect(mocks.raiseAlert.mock.calls[0][0].title).toMatch(/^[\x20-\x7E]+$/)
  })

  it('carries the silent job ids as a flat array, which is what the throttle reads', async () => {
    mocks.findMany.mockResolvedValue([])

    await executeJobHeartbeatCheck(step, NOW)

    const { payload } = mocks.raiseAlert.mock.calls[0][0]
    expect(Array.isArray(payload.jobs)).toBe(true)
    expect(payload.jobs).toEqual(WATCHED_JOBS.map((j) => j.jobId))
  })

  it('says nothing at all when every job is beating', async () => {
    mocks.findMany.mockResolvedValue(
      WATCHED_JOBS.map((j) => ({ jobId: j.jobId, lastRunAt: NOW })),
    )

    const result = await executeJobHeartbeatCheck(step, NOW)

    expect(result).toMatchObject({ overdue: 0, alerted: false })
    expect(mocks.raiseAlert).not.toHaveBeenCalled()
    // Nothing is wrong, so the throttle is not even consulted.
    expect(mocks.auditFindMany).not.toHaveBeenCalled()
  })
})

describe('not saying it 96 times a day', () => {
  const silentDebitRun = () =>
    mocks.findMany.mockResolvedValue(
      WATCHED_JOBS.filter((j) => j.jobId !== 'debit-run').map((j) => ({
        jobId: j.jobId,
        lastRunAt: NOW,
      })),
    )

  it('stays quiet when the same set was reported inside the window', async () => {
    silentDebitRun()
    mocks.auditFindMany.mockResolvedValue([{ payload: { jobs: ['debit-run'] } }])

    const result = await executeJobHeartbeatCheck(step, NOW)

    expect(result).toMatchObject({ overdue: 1, alerted: false })
    expect(mocks.raiseAlert).not.toHaveBeenCalled()
  })

  it('speaks immediately when a second job goes silent during the quiet window', async () => {
    // The case a plain time window would swallow, and the one that matters
    // most: reconciliation has been quiet for hours, that was reported, and now
    // the debit run has stopped too. Waiting out the window to mention it is
    // not a throttle, it is a missed alert.
    mocks.findMany.mockResolvedValue(
      WATCHED_JOBS.filter((j) => j.jobId !== 'debit-run' && j.jobId !== 'ledger-reconciliation').map(
        (j) => ({ jobId: j.jobId, lastRunAt: NOW }),
      ),
    )
    mocks.auditFindMany.mockResolvedValue([{ payload: { jobs: ['ledger-reconciliation'] } }])

    const result = await executeJobHeartbeatCheck(step, NOW)

    expect(result.alerted).toBe(true)
    expect(mocks.raiseAlert).toHaveBeenCalledOnce()
  })

  it('compares the set regardless of the order it was written in', async () => {
    mocks.findMany.mockResolvedValue(
      WATCHED_JOBS.filter((j) => j.jobId !== 'debit-run' && j.jobId !== 'notification-flush').map(
        (j) => ({ jobId: j.jobId, lastRunAt: NOW }),
      ),
    )
    mocks.auditFindMany.mockResolvedValue([
      { payload: { jobs: ['notification-flush', 'debit-run'] } },
    ])

    const result = await executeJobHeartbeatCheck(step, NOW)

    expect(result.alerted).toBe(false)
  })

  it('speaks when the last alert predates the window, so nothing is returned', async () => {
    silentDebitRun()
    mocks.auditFindMany.mockResolvedValue([])

    expect((await executeJobHeartbeatCheck(step, NOW)).alerted).toBe(true)
  })

  it('speaks when a stored payload has no job list to compare against', async () => {
    // An entry written before this shape existed, or by something else. Failing
    // towards speaking is the correct direction for an alert.
    silentDebitRun()
    mocks.auditFindMany.mockResolvedValue([{ payload: { severity: 'critical' } }])

    expect((await executeJobHeartbeatCheck(step, NOW)).alerted).toBe(true)
  })

  it('throttles on the audit log, not on Redis', async () => {
    // The cache client is a no-op shim whenever Upstash is unconfigured, so
    // every read returns null and a Redis throttle fails *open* — here, on an
    // alert that repeats every fifteen minutes.
    silentDebitRun()

    await executeJobHeartbeatCheck(step, NOW)

    const where = mocks.auditFindMany.mock.calls[0][0]
    expect(where).toMatchObject({ action: 'SCHEDULED_JOB_SILENT' })
    expect(where.createdAt.gte).toBeInstanceOf(Date)
  })
})

describe('the check as an Inngest run', () => {
  it('raises the alert exactly once however many times the run is re-entered', async () => {
    // The side effect that must not repeat. An alert raised outside a step is
    // raised again on every re-entry, and Inngest re-enters a function once per
    // step it resumes from — so a run with four steps sends four SMSs about the
    // same silent job. Side effects belong inside a step; only a memoising stub
    // shows the difference, because a stub that always executes sends twice
    // either way.
    //
    // The *counting* here is deliberately outside any step, but note that is
    // not what this test proves: `computeOverdue` returns its result rather
    // than accumulating into a captured variable, so it would survive
    // memoisation in either position. The ledger-reconciliation defect was an
    // increment inside a step body, which is a different shape from this one.
    mocks.findMany.mockResolvedValue([])
    const memo = memoisingStep()

    const first = await executeJobHeartbeatCheck(memo, NOW)
    const replay = await executeJobHeartbeatCheck(memo, NOW)

    expect(first.overdue).toBe(WATCHED_JOBS.length)
    expect(replay.overdue).toBe(WATCHED_JOBS.length)
    expect(replay.jobs).toEqual(first.jobs)
    expect(mocks.raiseAlert).toHaveBeenCalledOnce()
    // Same for the heartbeat write: one beat per run, not one per re-entry.
    expect(mocks.upsert).toHaveBeenCalledOnce()
  })

  it('records its own heartbeat after reading, never before', async () => {
    mocks.findMany.mockResolvedValue(
      WATCHED_JOBS.map((j) => ({ jobId: j.jobId, lastRunAt: NOW })),
    )
    const memo = memoisingStep()

    await executeJobHeartbeatCheck(memo, NOW)

    expect(memo.executed.indexOf('read-heartbeats')).toBeLessThan(memo.executed.indexOf('heartbeat'))
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { jobId: 'job-heartbeat-check' } }),
    )
  })

  it('still beats on a run that raised an alert', async () => {
    mocks.findMany.mockResolvedValue([])

    await executeJobHeartbeatCheck(step, NOW)

    expect(mocks.upsert).toHaveBeenCalledOnce()
  })
})

describe('writing a heartbeat', () => {
  it('upserts, so the first run of a newly watched job creates its row', async () => {
    await recordJobHeartbeat('debit-run', NOW)

    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { jobId: 'debit-run' },
      create: { jobId: 'debit-run', lastRunAt: NOW },
      update: { lastRunAt: NOW },
    })
  })

  it('never throws, because the debit run calls it after money has moved', async () => {
    // The observability mechanism must not become a failure mode for the money
    // path. A failed heartbeat write leaves the row stale, and a stale row is
    // exactly what the checker alerts on — so the failure mode of swallowing
    // here is a false alarm, never a missed one.
    mocks.upsert.mockRejectedValue(new Error('connection terminated'))

    await expect(recordJobHeartbeat('debit-run', NOW)).resolves.toBeUndefined()
    expect(mocks.logError).toHaveBeenCalled()
  })

  it('reads back a null for any watched job with no row', async () => {
    mocks.findMany.mockResolvedValue([{ jobId: 'debit-run', lastRunAt: NOW }])

    const readings = await readHeartbeats()

    expect(readings).toHaveLength(WATCHED_JOBS.length)
    expect(readings.find((r) => r.jobId === 'debit-run')?.lastRunAt).toBe(NOW.toISOString())
    expect(readings.find((r) => r.jobId === 'notification-flush')?.lastRunAt).toBeNull()
  })

  it('serialises dates to strings, so a memoised step replays identically', async () => {
    // Inngest records a step's return value as JSON. A Date survives the first
    // pass and comes back a string on re-entry, so anything comparing it to a
    // Date would behave differently on a replay than on the original run.
    mocks.findMany.mockResolvedValue([{ jobId: 'debit-run', lastRunAt: NOW }])

    const readings = await readHeartbeats()

    for (const reading of readings) {
      expect(reading.lastRunAt === null || typeof reading.lastRunAt === 'string').toBe(true)
    }
  })
})

describe('the registry and the jobs agree', () => {
  const sourceOf = async (relative: string) => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    return readFileSync(resolve(__dirname, relative), 'utf8')
  }

  it('every watched job actually writes the heartbeat it is watched for', async () => {
    // A registry entry without a matching write is an alert that fires forever.
    // This is the assertion that makes adding a job to the list safe, and it is
    // the guard, not an accident.
    const files: Record<string, string> = {
      'debit-run': '../inngest/functions/debit-run.ts',
      'transaction-retry-failed': '../inngest/functions/transaction-retry-failed.ts',
      'ledger-reconciliation': '../inngest/functions/ledger-reconciliation.ts',
      'mandate-status-sync': '../inngest/functions/mandate-status-sync.ts',
      'notification-flush': '../inngest/functions/notification-flush.ts',
      'job-heartbeat-check': '../inngest/functions/job-heartbeat-check.ts',
    }

    expect(Object.keys(files).sort()).toEqual(WATCHED_JOBS.map((j) => j.jobId).sort())

    for (const [jobId, path] of Object.entries(files)) {
      const source = await sourceOf(path)
      expect(source, `${jobId} does not record a heartbeat`).toContain(
        `recordJobHeartbeat('${jobId}'`,
      )
    }
  })

  it('every exported function is registered in the serve route', async () => {
    // The failure this whole mechanism exists to catch, in its cheapest form: a
    // function that is written, exported and never served runs never, and
    // nothing anywhere says so. Two hand-maintained lists is what makes that
    // possible, so something has to hold them together.
    const barrel = await sourceOf('../inngest/index.ts')
    const route = await sourceOf('../app/api/v1/webhooks/inngest/route.ts')

    const exported = [...barrel.matchAll(/export \{ (\w+) \}/g)].map((m) => m[1])
    expect(exported.length).toBeGreaterThan(15)

    const registered = route.slice(route.indexOf('functions: ['))
    for (const name of exported) {
      expect(registered, `${name} is exported but never served`).toContain(`${name},`)
    }
  })

  it('does not watch the event-triggered mandate delay handler', async () => {
    // It fires on `xxm/mandate.delay-handler`, not a cron, so a month in which
    // nobody moves a debit date is a month in which it correctly never runs.
    // There is no expected interval, and watching it would produce nothing but
    // false alarms.
    expect(WATCHED_JOBS.map((j) => j.jobId)).not.toContain('mandate-delay-handler')

    const source = await sourceOf('../inngest/functions/mandate-delay-handler.ts')
    expect(source).toContain("event: 'xxm/mandate.delay-handler'")
  })

  it('gives every watched job a label and a consequence fit to read in an SMS', () => {
    for (const job of WATCHED_JOBS) {
      expect(job.label, job.jobId).toMatch(/^[\x20-\x7E]+$/)
      expect(job.consequence, job.jobId).toMatch(/^[\x20-\x7E]+$/)
      expect(job.maxSilenceMinutes).toBeGreaterThan(0)
    }
  })
})
