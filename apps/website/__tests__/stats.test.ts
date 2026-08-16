import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The public site's only live data.
 *
 * `getPublicStats` reaches the member app for the member count, the pooled
 * total and how long the Foundation has been running, and falls back to static
 * values when it cannot. The fallback is the interesting part: this is a public
 * marketing page, so a silent wrong number is worse than a visible absence —
 * "R0 pooled" reads as a failed collective rather than as a failed fetch.
 *
 * These cases pin the behaviour that matters: the real numbers are used when
 * they arrive, the fallback is used rather than throwing when they do not, and
 * — the part that had no test and no logging — a failure is reported somewhere
 * a person will see it instead of being swallowed.
 */

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

vi.mock('@/lib/env', () => ({
  siteEnv: {
    APP_URL: 'http://member.test',
    SITE_URL: 'http://site.test',
    ADMIN_URL: 'http://admin.test',
    WA_LINK: 'https://chat.whatsapp.com/test',
    ADMIN_WA_NUMBER: '27000000000',
    SUPPORT_EMAIL: 'support@example.invalid',
  },
}))

const ok = (data: unknown) => ({ ok: true, json: async () => ({ data }) })

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.resetModules()
  fetchMock.mockReset()
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => warn.mockRestore())

async function load() {
  return await import('@/lib/stats')
}

describe('the numbers the public sees', () => {
  it('uses what the member app reports', async () => {
    fetchMock.mockResolvedValue(ok({ members: 37, totalPooled: 412_500, monthsActive: 14 }))
    const { getPublicStats } = await load()

    expect(await getPublicStats()).toEqual({ members: 37, totalPooled: 412_500, monthsActive: 14 })
  })

  it('asks the member app, not itself', async () => {
    // A site pointed at its own origin would 404 forever and quietly show the
    // fallback, which is exactly the failure mode that looks like working.
    fetchMock.mockResolvedValue(ok({ members: 1, totalPooled: 1, monthsActive: 1 }))
    const { getPublicStats } = await load()
    await getPublicStats()

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://member.test/api/v1/stats/public')
  })

  it('does not hang the page waiting for a member app that is down', async () => {
    fetchMock.mockResolvedValue(ok({ members: 1, totalPooled: 1, monthsActive: 1 }))
    const { getPublicStats } = await load()
    await getPublicStats()

    // A marketing page that blocks on a slow internal call is a marketing page
    // nobody sees. The signal is what enforces that.
    const init = fetchMock.mock.calls[0]?.[1] as { signal?: AbortSignal } | undefined
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })
})

describe('when the member app cannot be reached', () => {
  it('falls back rather than throwing, so the page still renders', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    const { getPublicStats, FALLBACK_STATS } = await load()

    await expect(getPublicStats()).resolves.toEqual(FALLBACK_STATS)
  })

  it('falls back on a non-OK response too', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) })
    const { getPublicStats, FALLBACK_STATS } = await load()

    await expect(getPublicStats()).resolves.toEqual(FALLBACK_STATS)
  })

  it('says so, instead of failing silently', async () => {
    // The whole point. The fallback publishes "R0 pooled" to the public, which
    // is a claim about the Foundation rather than a missing value. If that is
    // going to happen it must leave a trace, or a site showing zero for a month
    // looks exactly like a site showing the truth.
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    const { getPublicStats } = await load()
    await getPublicStats()

    expect(warn).toHaveBeenCalled()
  })

  it('falls back when the payload is missing the data envelope', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
    const { getPublicStats, FALLBACK_STATS } = await load()

    await expect(getPublicStats()).resolves.toEqual(FALLBACK_STATS)
  })
})

describe('the fallback itself', () => {
  it('never claims more than the Foundation can stand behind', async () => {
    const { FALLBACK_STATS } = await load()

    // Four founders is a fact that does not depend on a fetch. A pooled total
    // is not, so it must not be invented — zero is honest here in a way that
    // any other number would not be.
    expect(FALLBACK_STATS.members).toBe(4)
    expect(FALLBACK_STATS.totalPooled).toBe(0)
    expect(FALLBACK_STATS.monthsActive).toBe(0)
  })
})
