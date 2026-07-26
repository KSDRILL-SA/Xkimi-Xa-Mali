import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The real adapter validates the environment at import time; this test is about
// which gateway gets chosen, not about env loading.
vi.mock('@/lib/env', () => ({
  env: {
    NETCASH_API_URL: 'https://netcash.test',
    NETCASH_SERVICE_KEY: 'k',
    NETCASH_WEBHOOK_SECRET: 's',
    ENCRYPTION_KEY: '0'.repeat(64),
  },
}))

/**
 * Selection happens at module load, so each case needs a fresh module registry
 * with the environment already in place.
 *
 * DEPLOY_ENV and VERCEL_ENV are cleared first because they outrank NODE_ENV when
 * deciding whether this is the live deployment, and both are set in environments
 * these tests run in — CI sets DEPLOY_ENV at job level. Leaving either in place
 * would quietly turn every "in production" case below into a non-production one.
 */
async function loadGateway(env: Record<string, string | undefined>) {
  vi.resetModules()
  const previous = { ...process.env }
  delete process.env.DEPLOY_ENV
  delete process.env.VERCEL_ENV
  Object.assign(process.env, env)
  try {
    return await import('@/integrations/payment')
  } finally {
    process.env = previous
  }
}

const ORIGINAL = { ...process.env }
beforeEach(() => vi.resetModules())
afterEach(() => { process.env = { ...ORIGINAL } })

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
