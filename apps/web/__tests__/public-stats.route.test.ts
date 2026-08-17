import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'

/**
 * The only unauthenticated endpoint in the system that reads the database.
 *
 * It was a bare `export async function GET()` — no rate limit, no error
 * handling, no trace id. Every other route in the app gets those from
 * `withApiHandler`, and this one, the single route a stranger can reach without
 * a session, had none of them.
 *
 * The rate limit had to be named rather than inherited. `withApiHandler`
 * throttles only POST/PUT/PATCH/DELETE, which is a deliberate and correct
 * choice for authenticated reads — and exactly the wrong default here.
 *
 * The reason it matters is that the mitigation fails together with the thing it
 * mitigates. A cache miss costs three queries; the hour-long TTL makes that
 * rare, unless Redis is unconfigured, in which case `cache.get` returns null
 * forever and every request pays all three. The endpoint was least protected in
 * precisely the state where it most needed protecting.
 */

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return {
    ...actual,
    NextResponse: {
      json: (body: unknown, init?: { status?: number; headers?: HeadersInit }) =>
        new Response(JSON.stringify(body), {
          status: init?.status ?? 200,
          headers: { 'content-type': 'application/json', ...Object.fromEntries(new Headers(init?.headers)) },
        }),
    },
  }
})

const limit = vi.fn(async () => ({ success: true }))
const cacheGet = vi.fn(async () => null as unknown)
const cacheSet = vi.fn(async () => {})
const getStats = vi.fn(async () => ({ members: 3, totalPooled: 480, monthsActive: 0 }))

async function loadRoute() {
  vi.resetModules()

  vi.doMock('@/lib/redis', () => ({
    publicStatsRatelimit: { limit },
    apiRatelimit: { limit: async () => ({ success: true }) },
    REDIS_CONFIGURED: false,
  }))
  vi.doMock('@/lib/cache', () => ({ cache: { get: cacheGet, set: cacheSet } }))
  vi.doMock('@/services/stats.service', () => ({ getPublicStats: getStats }))

  const { GET } = await import('@/app/api/v1/stats/public/route')
  return GET
}

/** One throwaway load, so no assertion pays the module graph's cold transform. */
beforeAll(async () => {
  await loadRoute()
}, 120_000)

beforeEach(() => {
  vi.clearAllMocks()
  limit.mockResolvedValue({ success: true })
  cacheGet.mockResolvedValue(null)
})

afterEach(() => {
  vi.doUnmock('@/lib/redis')
  vi.doUnmock('@/lib/cache')
  vi.doUnmock('@/services/stats.service')
  vi.resetModules()
})

const req = (ip = '203.0.113.9') =>
  new Request('http://member.test/api/v1/stats/public', {
    headers: { 'x-forwarded-for': ip },
  }) as never

describe('GET /api/v1/stats/public — reachable by anyone, so limited', () => {
  it('serves the aggregates on a normal request', async () => {
    const GET = await loadRoute()
    const res = await GET(req(), { params: Promise.resolve({}) })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: { members: 3, totalPooled: 480, monthsActive: 0 } })
  })

  it('refuses with 429 once the limiter says no', async () => {
    limit.mockResolvedValue({ success: false })
    const GET = await loadRoute()
    const res = await GET(req(), { params: Promise.resolve({}) })

    expect(res.status).toBe(429)
  })

  it('does not touch the database when it refuses', async () => {
    // The whole point of the limit. A 429 that still ran the three queries
    // would be a throttle on the response and not on the load.
    limit.mockResolvedValue({ success: false })
    const GET = await loadRoute()
    await GET(req(), { params: Promise.resolve({}) })

    expect(getStats).not.toHaveBeenCalled()
    expect(cacheGet).not.toHaveBeenCalled()
  })

  it('keys the limit on the caller, not globally', async () => {
    // A global key would let one noisy source lock every visitor out of the
    // marketing site's figures.
    const GET = await loadRoute()
    await GET(req('198.51.100.4'), { params: Promise.resolve({}) })

    expect(limit).toHaveBeenCalledWith('198.51.100.4')
  })

  it('serves from cache without querying, when the cache has it', async () => {
    cacheGet.mockResolvedValue({ members: 9, totalPooled: 1000, monthsActive: 2 })
    const GET = await loadRoute()
    const res = await GET(req(), { params: Promise.resolve({}) })

    expect(await res.json()).toEqual({ data: { members: 9, totalPooled: 1000, monthsActive: 2 } })
    expect(getStats).not.toHaveBeenCalled()
  })
})

describe('the deployment with no Redis, where every protection fails at once', () => {
  // The case the first version of this fix missed, and the reason the memo
  // exists. With no Redis: `cache.get` returns null on every call AND
  // `makeRatelimit` hands back a no-op limiter that always allows. So the rate
  // limit — the thing added to protect this endpoint — is one of the things
  // that disappears. It is easy to believe a limiter closes this. It does not.
  const allowAlways = async () => ({ success: true })

  it('reads the database once, not once per request', async () => {
    const GET = await loadRoute()
    limit.mockImplementation(allowAlways)
    cacheGet.mockResolvedValue(null) // no Redis: always a miss

    for (let i = 0; i < 25; i++) {
      await GET(req(`198.51.100.${i}`), { params: Promise.resolve({}) })
    }

    // Twenty-five requests from twenty-five different IPs, so a per-IP limiter
    // would not have helped even if one were running.
    expect(getStats).toHaveBeenCalledTimes(1)
  })

  it('still answers correctly from the memo', async () => {
    const GET = await loadRoute()
    cacheGet.mockResolvedValue(null)

    await GET(req(), { params: Promise.resolve({}) })
    const res = await GET(req(), { params: Promise.resolve({}) })

    expect(await res.json()).toEqual({ data: { members: 3, totalPooled: 480, monthsActive: 0 } })
  })

  it('goes back to the database once the memo has expired', async () => {
    // A bound, not a freeze. The figures must still move.
    vi.useFakeTimers()
    try {
      const GET = await loadRoute()
      cacheGet.mockResolvedValue(null)

      await GET(req(), { params: Promise.resolve({}) })
      expect(getStats).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(3600 * 1000 + 1)
      await GET(req(), { params: Promise.resolve({}) })

      expect(getStats).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('what it must never return', () => {
  it('carries aggregates only — no field that could identify a member', async () => {
    const GET = await loadRoute()
    const res = await GET(req(), { params: Promise.resolve({}) })
    const body = JSON.stringify(await res.json())

    // This endpoint is public. If it ever grows a field, this is the case that
    // has to be argued with first.
    for (const leak of ['email', 'phone', 'idNumber', 'name', 'firstName', 'surname', 'accountNumber']) {
      expect(body.toLowerCase()).not.toContain(leak.toLowerCase())
    }
  })
})
