import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The guard that stops a misconfigured deploy going public.
 *
 * This site used to fall back to hardcoded production values — a domain, the
 * WhatsApp group invite, an admin phone number. A fallback that looks like a
 * real value cannot be told apart from one, so a misconfigured deploy published
 * a plausible site pointing at the wrong domain and inviting people through a
 * link nobody had checked was current.
 *
 * Now the live build fails and names what is missing, and everywhere else falls
 * back to something self-evidently fake. These cases hold that line, including
 * the two details that are easy to lose in a refactor: an unset Vercel variable
 * arrives as an **empty string** rather than undefined, and the error must name
 * the variables so the fix is obvious from the build log alone.
 *
 * A note on what "live" means here, because it is not obvious and cost an hour
 * of CI to work out: `isLiveDeployment()` reads DEPLOY_ENV, then VERCEL_ENV,
 * then NODE_ENV. This module is reachable from the browser bundle, where Next
 * inlines only `NEXT_PUBLIC_*` — so the first two read as undefined there and
 * NODE_ENV decides. Every production build therefore looks live to this guard.
 * That is the safe direction for it to be wrong in, and it is why CI has to
 * supply real-shaped values rather than rely on an exemption.
 */

const PUBLIC_VARS = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_ADMIN_URL',
  'NEXT_PUBLIC_WHATSAPP_GROUP_LINK',
  'NEXT_PUBLIC_ADMIN_WHATSAPP_NUMBER',
  'NEXT_PUBLIC_SUPPORT_EMAIL',
] as const

/**
 * `vi.stubEnv` rather than replacing `process.env`. Replacing it detaches the
 * object every other file's stubs hold a reference to, and their cleanup then
 * restores onto something nobody reads. The web app has a long comment about
 * discovering that the hard way.
 */
function setEnv(values: Record<string, string | undefined>) {
  for (const key of [...PUBLIC_VARS, 'DEPLOY_ENV', 'VERCEL_ENV', 'NODE_ENV']) {
    vi.stubEnv(key, undefined as unknown as string)
  }
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) vi.stubEnv(key, value)
  }
}

const ALL_SET = Object.fromEntries(
  PUBLIC_VARS.map((v) => [v, v.endsWith('URL') || v.endsWith('LINK') ? 'https://real.example' : 'real-value']),
)

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllEnvs())

describe('away from a live deployment', () => {
  it('falls back to placeholders instead of failing', async () => {
    setEnv({ DEPLOY_ENV: 'ci' })
    const { siteEnv } = await import('@/lib/env')

    expect(siteEnv.SITE_URL).toBe('http://localhost:3001')
    expect(siteEnv.APP_URL).toBe('http://localhost:3000')
    expect(siteEnv.ADMIN_URL).toBe('http://localhost:3002')
  })

  it('makes the placeholders obviously fake, so a stray one is caught by eye', async () => {
    setEnv({ DEPLOY_ENV: 'ci' })
    const { siteEnv } = await import('@/lib/env')

    // The whole point of the rewrite: a placeholder must not be mistakable for
    // a real value by someone glancing at a staging site.
    expect(siteEnv.WA_LINK).toContain('not-configured')
    expect(siteEnv.SUPPORT_EMAIL).toContain('.invalid')
    expect(siteEnv.ADMIN_WA_NUMBER).toBe('27000000000')
  })

  it('still prefers a real value when one is supplied', async () => {
    setEnv({ DEPLOY_ENV: 'ci', NEXT_PUBLIC_SITE_URL: 'https://staging.example' })
    const { siteEnv } = await import('@/lib/env')

    expect(siteEnv.SITE_URL).toBe('https://staging.example')
  })
})

describe('on a live deployment', () => {
  it('refuses to build when anything is missing', async () => {
    setEnv({ DEPLOY_ENV: 'production' })

    await expect(import('@/lib/env')).rejects.toThrow(/Missing required public configuration/)
  })

  it('names every missing variable, so the build log is the fix list', async () => {
    setEnv({ DEPLOY_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://real.example' })

    // Naming them is the difference between a build failure someone can act on
    // and one they have to bisect.
    await expect(import('@/lib/env')).rejects.toThrow(/NEXT_PUBLIC_APP_URL/)
    vi.resetModules()
    setEnv({ DEPLOY_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://real.example' })
    await expect(import('@/lib/env')).rejects.toThrow(/NEXT_PUBLIC_SUPPORT_EMAIL/)
  })

  it('treats an empty string as missing', async () => {
    // An unset variable on Vercel arrives as '' rather than undefined. Without
    // this the guard passes and the site publishes empty hrefs.
    setEnv({ ...ALL_SET, DEPLOY_ENV: 'production', NEXT_PUBLIC_APP_URL: '' })

    await expect(import('@/lib/env')).rejects.toThrow(/NEXT_PUBLIC_APP_URL/)
  })

  it('treats whitespace as missing too', async () => {
    setEnv({ ...ALL_SET, DEPLOY_ENV: 'production', NEXT_PUBLIC_ADMIN_URL: '   ' })

    await expect(import('@/lib/env')).rejects.toThrow(/NEXT_PUBLIC_ADMIN_URL/)
  })

  it('builds when everything is supplied, and trims what it stores', async () => {
    setEnv({ ...ALL_SET, DEPLOY_ENV: 'production', NEXT_PUBLIC_SITE_URL: '  https://xkimi.example  ' })
    const { siteEnv } = await import('@/lib/env')

    expect(siteEnv.SITE_URL).toBe('https://xkimi.example')
  })
})

describe('what NODE_ENV alone implies', () => {
  it('treats a production build as live even with no deploy hints', async () => {
    // This is the behaviour that made CI fail: in the browser bundle DEPLOY_ENV
    // and VERCEL_ENV are inlined away to undefined, so NODE_ENV is all that is
    // left and every production build looks live. Pinned deliberately — if it
    // ever changes, a misconfigured deploy stops being caught.
    setEnv({ NODE_ENV: 'production' })

    await expect(import('@/lib/env')).rejects.toThrow(/Missing required public configuration/)
  })
})
