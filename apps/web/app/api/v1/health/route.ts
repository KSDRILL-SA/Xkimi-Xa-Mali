import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { redis, REDIS_CONFIGURED } from '@/lib/redis'
import { readHeartbeats, computeOverdue } from '@/lib/job-heartbeat'

const startTime = Date.now()

export async function GET() {
  const checks = await Promise.allSettled([
    db.$queryRaw`SELECT 1`,
    // Only a genuinely-configured Redis is pinged. The no-op client returns
    // 'PONG' unconditionally, so pinging it would falsely report "ok".
    REDIS_CONFIGURED ? redis.ping() : Promise.resolve('skipped'),
    // Job liveness, read from outside Inngest.
    //
    // `job-heartbeat-check` is the primary detector and it is itself a cron, so
    // it cannot report its own absence — if Inngest stops scheduling anything,
    // the watcher stops too and no alert is raised by anyone. This endpoint is
    // reached over HTTP by whatever is already pinging the deployment, which is
    // a different failure domain entirely, so it still answers when every job
    // in the system is dead.
    readHeartbeats(),
  ])

  const dbOk = checks[0].status === 'fulfilled'
  // Distinguish reachable, unreachable, and deliberately-unconfigured so a
  // production deploy missing the Upstash env is visible instead of green.
  const redisStatus = !REDIS_CONFIGURED
    ? 'not_configured'
    : checks[1].status === 'fulfilled'
      ? 'ok'
      : 'error'

  // Silent jobs are reported but do **not** flip the HTTP status.
  //
  // This endpoint's contract is "is this instance serving requests", and a 503
  // is read by hosting and failover tooling as "take it out of rotation" —
  // which is the wrong remedy for a cron that stopped firing, and would replace
  // a working web app with no web app. The stale job list goes in the body
  // instead, where an uptime monitor can be pointed at `checks.jobs` with a
  // keyword assertion. This mirrors the existing decision about an unconfigured
  // Redis directly above.
  const heartbeats = checks[2]
  const staleCount = heartbeats.status === 'fulfilled' ? computeOverdue(heartbeats.value).length : null

  // Status and a count, never the job names.
  //
  // This route is public and unauthenticated. "notification-flush is stale"
  // tells an anonymous reader that nothing is being delivered to anybody right
  // now, which is a window rather than a status. The count is enough for a
  // monitor to assert on and enough for a human to know to look; the names are
  // in the alert, the audit log and `job_heartbeats`, all of which require
  // being the operator. `unknown` rather than `ok` when the read itself failed:
  // absent evidence is not good news.
  const jobsStatus = staleCount === null ? 'unknown' : staleCount > 0 ? 'stale' : 'ok'

  // The DB is always required. A configured-but-unreachable Redis is a real
  // outage; an unconfigured Redis is a config state that does not fail health,
  // but is surfaced in the body so monitors can alert on it.
  const healthy = dbOk && redisStatus !== 'error'

  return NextResponse.json(
    {
      status:  healthy ? 'ok' : 'degraded',
      version: process.env.npm_package_version ?? '0.1.0',
      uptime:  Math.floor((Date.now() - startTime) / 1000),
      checks: {
        db:    dbOk ? 'ok' : 'error',
        redis: redisStatus,
        jobs:  jobsStatus,
      },
      ...(staleCount ? { staleJobs: staleCount } : {}),
      ts: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
