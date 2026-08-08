import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The real adapter validates the environment at import time; this test is about
// which gateway gets chosen, not about env loading.
vi.mock('@/lib/env', () => ({
  env: {
    NETCASH_API_URL: 'https://netcash.test',
    NETCASH_DEBICHECK_TEMPLATE_ID: 'NCDCT000000001',
    NETCASH_SERVICE_KEY: 'k',
    NETCASH_WEBHOOK_SECRET: 's',
    ENCRYPTION_KEY: '0'.repeat(64),
  },
}))

/**
 * Every variable that can change the outcome, cleared before each case is set
 * up. DEPLOY_ENV and VERCEL_ENV matter most: they outrank NODE_ENV when deciding
 * whether this is the live deployment, and both are set in environments these
 * tests run in — CI sets DEPLOY_ENV at job level. Leaving either in place would
 * quietly turn every "in production" case below into a non-production one.
 */
const CONTROLLED = ['PAYMENT_GATEWAY', 'NODE_ENV', 'DEPLOY_ENV', 'VERCEL_ENV']

/**
 * Selection happens at module load, so each case needs a fresh module registry
 * with the environment already in place.
 *
 * `vi.stubEnv` rather than assigning to `process.env`, and this is not a style
 * preference. Vitest reuses a worker thread across test files. Replacing
 * `process.env` with a plain object detaches it from the one every other file's
 * stubs hold a reference to, so their `unstubAllEnvs` restores onto an object
 * nobody reads any more and their environment leaks into whatever runs next in
 * that worker. This file used to do exactly that, and it is why it,
 * `env-netcash` and `whatsapp.preferences` failed together at random under load
 * — roughly one full-suite run in four, passing on every re-run and standalone.
 * `env-netcash` already carried a comment warning against it.
 */
async function loadGateway(env: Record<string, string | undefined>) {
  vi.resetModules()
  for (const key of CONTROLLED) vi.stubEnv(key, undefined as unknown as string)
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) vi.stubEnv(key, value)
  }
  return await import('@/integrations/payment')
}

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllEnvs())

describe('choosing a payment gateway', () => {
  it('uses the real gateway when nothing is set', async () => {
    const mod = await loadGateway({ PAYMENT_GATEWAY: undefined, NODE_ENV: 'development' })
    expect(mod.IS_MOCK_GATEWAY).toBe(false)
  })

  it('uses the real gateway for any value other than the exact opt-in', async () => {
    // No fuzzy matching: a typo must not silently disable real payments.
    for (const value of ['MOCK', 'mocked', 'true', '1', 'netcash', '']) {
      const mod = await loadGateway({ PAYMENT_GATEWAY: value, NODE_ENV: 'development' })
      expect(mod.IS_MOCK_GATEWAY, `PAYMENT_GATEWAY=${value}`).toBe(false)
    }
  })

  it('uses the stand-in when explicitly asked, outside production', async () => {
    const mod = await loadGateway({ PAYMENT_GATEWAY: 'mock', NODE_ENV: 'development' })
    expect(mod.IS_MOCK_GATEWAY).toBe(true)
  })

  it('uses the stand-in under test', async () => {
    const mod = await loadGateway({ PAYMENT_GATEWAY: 'mock', NODE_ENV: 'test' })
    expect(mod.IS_MOCK_GATEWAY).toBe(true)
  })
})

describe('the mock can never run in production', () => {
  // A mock gateway in production would report every debit as collected while no
  // money moved: contributions marked paid, a pool balance that does not exist,
  // and the members finding out at the worst possible moment. Failing to boot is
  // the only safe answer, and it fails on deploy rather than on debit night.
  it('refuses to start rather than falling back quietly', async () => {
    await expect(loadGateway({ PAYMENT_GATEWAY: 'mock', NODE_ENV: 'production' }))
      .rejects.toThrow(/Refusing to start/)
  })

  it('says why, so whoever set it understands the risk', async () => {
    await expect(loadGateway({ PAYMENT_GATEWAY: 'mock', NODE_ENV: 'production' }))
      .rejects.toThrow(/moves no money|reported? uncollected debits as settled/i)
  })

  it('still starts normally in production without the flag', async () => {
    const mod = await loadGateway({ PAYMENT_GATEWAY: undefined, NODE_ENV: 'production' })
    expect(mod.IS_MOCK_GATEWAY).toBe(false)
  })
})
