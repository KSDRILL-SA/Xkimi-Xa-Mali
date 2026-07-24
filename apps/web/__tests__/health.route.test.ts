import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// The route reads `REDIS_CONFIGURED` and `redis` from '@/lib/redis' and runs
// `db.$queryRaw` from '@/lib/db' at request time. To exercise the three Redis
// states (reachable / unreachable / unconfigured) independently we reset the
// module registry and re-mock both modules per test, then dynamically import a
// fresh copy of the route.
// ---------------------------------------------------------------------------

type RedisState = {
  configured: boolean
  pingRejects?: boolean
}

async function loadRoute(opts: { dbFails?: boolean; redis: RedisState }) {
  vi.resetModules()

  const ping = vi.fn(() =>
    opts.redis.pingRejects ? Promise.reject(new Error('unreachable')) : Promise.resolve('PONG'),
  )

  vi.doMock('@/lib/db', () => ({
    db: {
      $queryRaw: vi.fn(() =>
        opts.dbFails ? Promise.reject(new Error('db down')) : Promise.resolve([{ '?column?': 1 }]),
      ),
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

  it('is never cached', async () => {
    const { GET } = await loadRoute({ redis: { configured: true } })
    const res = await GET()

    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
