import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The public site's only live data.
 *
 * `getPublicStats` reaches the member app for the member count, the pooled total
 * and how long the Foundation has been running. All three are measured in the
 * database; this module's whole job is to carry them to the page unchanged, or
 * to admit it could not.
 *
 * It used to substitute a fallback instead — the founder count for `members`,
 * zero for the rest. That is the behaviour these cases now forbid. The founder
 * count and the active member count are different facts that are equal today
 * only by coincidence, and the day they diverge, an outage would have the public
 * page state the wrong size of the collective in the same typeface as two
 * measured figures. Returning `null` forces each caller to decide what to show
 * when there is nothing true to show, which is a question about honesty and does
 * not belong hidden inside a default.
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
    // A site pointed at its own origin would 404 forever and quietly show no
    // figures, which is exactly the failure mode that looks like working.
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
  it('reports nothing rather than throwing, so the page still renders', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    const { getPublicStats } = await load()

    await expect(getPublicStats()).resolves.toBeNull()
  })

  it('reports nothing on a non-OK response too', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) })
    const { getPublicStats } = await load()

    await expect(getPublicStats()).resolves.toBeNull()
  })

  it('says so, instead of failing silently', async () => {
    // The whole point. An outage changes what every visitor sees, so it must
    // leave a trace — otherwise a site showing no figures for a month looks
    // exactly like a site nobody has looked at.
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    const { getPublicStats } = await load()
    await getPublicStats()

    expect(warn).toHaveBeenCalled()
  })

  it('never substitutes the founder count for the member count', async () => {
    // The regression this module was rewritten to prevent. These are different
    // facts, equal today by coincidence; asserted against the constant rather
    // than the literal 4, because a test that hardcodes the number it checks
    // cannot catch that number drifting.
    const { getPublicStats } = await load()
    const { FOUNDER_COUNT } = await import('@xxm/utils')

    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await getPublicStats()

    expect(result).toBeNull()
    expect(result).not.toMatchObject({ members: FOUNDER_COUNT })
  })
})

describe('the envelope is checked, not assumed', () => {
  // Each of these used to pass straight through `json.data as PublicStats`. A
  // cast cannot fail, so every one of them reached the page: `undefined` in a
  // stat tile, or `NaN` where a rand total belongs.
  const bad: Array<[string, unknown]> = [
    ['no data envelope', {}],
    ['data is null', { data: null }],
    ['a field is missing', { data: { members: 3, totalPooled: 100 } }],
    ['a field is a string', { data: { members: '3', totalPooled: 100, monthsActive: 2 } }],
    ['a field is null', { data: { members: null, totalPooled: 100, monthsActive: 2 } }],
    ['a field is NaN', { data: { members: Number.NaN, totalPooled: 100, monthsActive: 2 } }],
    ['a field is Infinity', { data: { members: 3, totalPooled: Infinity, monthsActive: 2 } }],
    ['a field is negative', { data: { members: 3, totalPooled: -100, monthsActive: 2 } }],
  ]

  for (const [name, payload] of bad) {
    it(`reports nothing when ${name}`, async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => payload })
      const { getPublicStats } = await load()

      await expect(getPublicStats()).resolves.toBeNull()
      expect(warn).toHaveBeenCalled()
    })
  }

  it('accepts a legitimate all-zero reading', async () => {
    // Zero members, zero pooled, zero months is what a brand new Foundation
    // truly looks like. It must not be confused with a failure to measure.
    fetchMock.mockResolvedValue(ok({ members: 0, totalPooled: 0, monthsActive: 0 }))
    const { getPublicStats } = await load()

    await expect(getPublicStats()).resolves.toEqual({ members: 0, totalPooled: 0, monthsActive: 0 })
  })

  it('ignores unexpected extra fields rather than passing them to the page', async () => {
    fetchMock.mockResolvedValue(ok({ members: 3, totalPooled: 100, monthsActive: 2, email: 'x@y.z' }))
    const { getPublicStats } = await load()

    // Aggregates only. If the member app ever leaks a field, the site does not
    // become the thing that publishes it.
    await expect(getPublicStats()).resolves.toEqual({ members: 3, totalPooled: 100, monthsActive: 2 })
  })
})
