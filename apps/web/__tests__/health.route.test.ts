import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// The route reads `REDIS_CONFIGURED` and `redis` from '@/lib/redis' and runs
// `db.$queryRaw` from '@/lib/db' at request time. To exercise the three Redis
// states (reachable / unreachable / unconfigured) independently we reset the
// module registry and re-mock both modules per test, then dynamically import a
// fresh copy of the route.
// ---------------------------------------------------------------------------

/**
 * `next/server` stubbed, and this is what stops the file timing out.
 *
 * `loadRoute` runs eleven times here, each one a `vi.resetModules()` followed by
 * a fresh `import` of the route — so Next's server runtime was being re-resolved
 * and re-evaluated eleven times. `@/lib/db` and `@/lib/redis` were already
 * mocked, so Prisma was never the cost; this was.
 *
 * Standalone that is about 250ms a cycle and nobody notices. Under the full
 * suite on a four-core machine it stretches far enough that eleven of them
 * cross the 30s timeout, which is what this test was failing on — not a wrong
 * answer, `Test timed out in 30000ms`.
 *
 * The stub is faithful to everything the route uses and everything the cases
 * assert: the route calls only `NextResponse.json(body, { status })`, and the
 * cases read only `res.status` and `await res.json()`. A plain `Response` does
 * both natively, so nothing is being pretended here that a real one would do
 * differently.
 *
 * `vi.mock` rather than the `vi.doMock` used for db and redis below: doMock
 * registrations have to be re-applied after every `resetModules()`, which is why
 * they live inside `loadRoute`. This one is constant across every case, so it is
 * hoisted and registered once.
 */
vi.mock('next/server', () => ({
  NextResponse: {
    // `init.headers` is passed through rather than dropped: the route sets
    // `Cache-Control: no-store` there, and "is never cached" asserts on it. A
    // first version of this stub kept only the status and that case failed
    // immediately — which is the stub being held to the real thing's contract,
    // and the reason to keep the case.
    json: (body: unknown, init?: { status?: number; headers?: HeadersInit }) =>
      new Response(JSON.stringify(body), {
        status: init?.status ?? 200,
        headers: { 'content-type': 'application/json', ...Object.fromEntries(new Headers(init?.headers)) },
      }),
  },
}))

type RedisState = {
  configured: boolean
  pingRejects?: boolean
}

/**
 * `beating` — every watched job wrote a heartbeat a moment ago.
 * `silent`  — no heartbeat rows at all, which is what a dead Inngest looks like.
 * `error`   — the heartbeat read itself failed.
 */
type HeartbeatState = 'beating' | 'silent' | 'error'

async function loadRoute(opts: {
  dbFails?: boolean
  redis: RedisState
  heartbeats?: HeartbeatState
}) {
  vi.resetModules()

  const ping = vi.fn(() =>
    opts.redis.pingRejects ? Promise.reject(new Error('unreachable')) : Promise.resolve('PONG'),
  )

  const heartbeats = opts.heartbeats ?? 'beating'

  // Imported after the reset so it resolves against the mocked db below, and
  // before the route so the fixture matches whatever the registry currently
  // holds rather than a hardcoded copy of it.
  const findMany = vi.fn(async () => {
    if (heartbeats === 'error') throw new Error('relation "job_heartbeats" does not exist')
    if (heartbeats === 'silent') return []
    const { WATCHED_JOBS } = await import('@/lib/job-heartbeat')
    return WATCHED_JOBS.map((job) => ({ jobId: job.jobId, lastRunAt: new Date() }))
  })

  vi.doMock('@/lib/db', () => ({
    db: {
      $queryRaw: vi.fn(() =>
        opts.dbFails ? Promise.reject(new Error('db down')) : Promise.resolve([{ '?column?': 1 }]),
      ),
      jobHeartbeat: { findMany },
    },
  }))

  vi.doMock('@/lib/redis', () => ({
    redis: { ping },
    REDIS_CONFIGURED: opts.redis.configured,
  }))

  const { GET } = await import('@/app/api/v1/health/route')
  return { GET, ping }
}

beforeEach(() => vi.clearAllMocks())

// `vi.doMock` registrations are not scoped to the file that made them. Vitest
// reuses a worker thread across files, so `@/lib/db` and `@/lib/redis` stayed
// mocked for whatever ran next in that worker — which is how `gateway-selection`
// came to fail in a run where nothing it touches had changed, passing on its own
// and passing on a re-run.
//
// This is §4.12 in a second costume. There the leak was `process.env` replaced
// wholesale; here it is a module registry left dirty. Same shape: a suite that
// fails in files nobody edited, roughly one full run in six, and reads as noise.
afterEach(() => {
  vi.doUnmock('@/lib/db')
  vi.doUnmock('@/lib/redis')
  vi.resetModules()
})

describe('GET /api/v1/health — honest Redis reporting', () => {
  it('reports ok/200 when the DB and a configured Redis are both reachable', async () => {
    const { GET, ping } = await loadRoute({ redis: { configured: true } })
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.checks).toMatchObject({ db: 'ok', redis: 'ok' })
    expect(ping).toHaveBeenCalledOnce()
  })

  it('reports not_configured without pinging the no-op client, and stays healthy', async () => {
    const { GET, ping } = await loadRoute({ redis: { configured: false } })
    const res = await GET()
    const body = await res.json()

    // A no-op Redis ping unconditionally returns 'PONG'; pinging it would
    // falsely read as "ok" and hide a production misconfiguration.
    expect(ping).not.toHaveBeenCalled()
    expect(res.status).toBe(200)
    expect(body.status).toBe('ok')
    expect(body.checks.redis).toBe('not_configured')
  })

  it('reports error/503 when a configured Redis is unreachable', async () => {
    const { GET } = await loadRoute({ redis: { configured: true, pingRejects: true } })
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.status).toBe('degraded')
    expect(body.checks.redis).toBe('error')
  })

  it('reports error/503 when the DB is unreachable, regardless of Redis', async () => {
    const { GET } = await loadRoute({ dbFails: true, redis: { configured: false } })
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body.status).toBe('degraded')
    expect(body.checks.db).toBe('error')
  })

  it('reports jobs ok when every watched job has beaten recently', async () => {
    const { GET } = await loadRoute({ redis: { configured: true } })
    const body = await (await GET()).json()

    expect(body.checks.jobs).toBe('ok')
    expect(body.staleJobs).toBeUndefined()
  })

  it('is never cached', async () => {
    const { GET } = await loadRoute({ redis: { configured: true } })
    const res = await GET()

    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('GET /api/v1/health — job liveness, read from outside Inngest', () => {
  it('reports stale when nothing is beating', async () => {
    // The state this endpoint exists to report: `job-heartbeat-check` is itself
    // a cron, so if Inngest stops scheduling anything the watcher stops with
    // everything else and raises nothing. This answers over HTTP, which is a
    // different failure domain, so it still speaks when every job is dead.
    const { GET } = await loadRoute({ redis: { configured: true }, heartbeats: 'silent' })
    const body = await (await GET()).json()
    const { WATCHED_JOBS } = await import('@/lib/job-heartbeat')

    expect(body.checks.jobs).toBe('stale')
    expect(body.staleJobs).toBe(WATCHED_JOBS.length)
  })

  it('never names the stale jobs on a public, unauthenticated endpoint', async () => {
    // "notification-flush is stale" tells an anonymous reader that nothing is
    // being delivered to anybody right now, which is a window rather than a
    // status. A monitor only needs the count; an operator has the alert, the
    // audit log and the table.
    const { GET } = await loadRoute({ redis: { configured: true }, heartbeats: 'silent' })
    const raw = await (await GET()).text()

    expect(raw).not.toContain('debit-run')
    expect(raw).not.toContain('notification-flush')
  })

  it('does not take the deployment out of rotation over a stalled cron', async () => {
    // A 503 is read by hosting and failover tooling as "replace this instance",
    // which is the wrong remedy for a job that stopped firing and would trade a
    // working web app for no web app. The same call as the unconfigured-Redis
    // case directly above it in the route.
    const { GET } = await loadRoute({ redis: { configured: true }, heartbeats: 'silent' })
    const res = await GET()

    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe('ok')
  })

  it('reports unknown rather than ok when the heartbeat read itself fails', async () => {
    // Absent evidence is not good news — the C-2 lesson. A failed read must not
    // be indistinguishable from a healthy answer.
    const { GET } = await loadRoute({ redis: { configured: true }, heartbeats: 'error' })
    const body = await (await GET()).json()

    expect(body.checks.jobs).toBe('unknown')
  })
})
