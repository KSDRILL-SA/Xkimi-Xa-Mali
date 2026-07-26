import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * The Netcash credentials are required only in a production build talking to
 * the real gateway. Validation runs at module load, so each case needs a fresh
 * module registry with the environment already in place.
 */

// Everything lib/env demands regardless of gateway, so a failure in these tests
// is always about the Netcash credentials and never about missing scaffolding.
const BASE_ENV = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  AUTH_SECRET: 'a'.repeat(32),
  ENCRYPTION_KEY: '0'.repeat(64),
  WHATSAPP_GROUP_LINK: 'https://chat.whatsapp.com/test',
}

const NETCASH_ENV = {
  NETCASH_SERVICE_KEY: 'service-key',
  NETCASH_WEBHOOK_SECRET: 'webhook-secret',
}

async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules()
  const previous = process.env
  process.env = { ...BASE_ENV, ...overrides } as NodeJS.ProcessEnv
  try {
    return await import('@/lib/env')
  } finally {
    process.env = previous
  }
}

const ORIGINAL = { ...process.env }
beforeEach(() => vi.resetModules())
afterEach(() => { process.env = { ...ORIGINAL } })

describe('Netcash credentials outside production', () => {
  it('are optional in development, so a local run needs no real keys', async () => {
    const mod = await loadEnv({ NODE_ENV: 'development' })
    expect(mod.env.NETCASH_SERVICE_KEY).toBeUndefined()
    expect(mod.env.NETCASH_WEBHOOK_SECRET).toBeUndefined()
  })

  it('are optional under test', async () => {
    const mod = await loadEnv({ NODE_ENV: 'test' })
    expect(mod.env.NETCASH_SERVICE_KEY).toBeUndefined()
  })

  it('are still read when they are supplied', async () => {
    const mod = await loadEnv({ NODE_ENV: 'development', ...NETCASH_ENV })
    expect(mod.env.NETCASH_SERVICE_KEY).toBe('service-key')
    expect(mod.env.NETCASH_WEBHOOK_SECRET).toBe('webhook-secret')
  })
})

describe('Netcash credentials in a production deploy', () => {
  // Both faults are invisible until money is already moving — an uncollected
  // debit run, or debits that collect while every webhook is rejected and
  // nothing is recorded. Refusing to build is the only point at which the fix
  // is still cheap.
  it('refuses to build without the service key', async () => {
    await expect(
      loadEnv({ NODE_ENV: 'production', NETCASH_WEBHOOK_SECRET: 'webhook-secret' }),
    ).rejects.toThrow(/NETCASH_SERVICE_KEY|Invalid environment variables/i)
  })

  it('refuses to build without the webhook secret', async () => {
    await expect(
      loadEnv({ NODE_ENV: 'production', NETCASH_SERVICE_KEY: 'service-key' }),
    ).rejects.toThrow(/NETCASH_WEBHOOK_SECRET|Invalid environment variables/i)
  })

  it('refuses an empty string, not only an absent variable', async () => {
    // An unset Vercel variable arrives as '' rather than undefined, which is the
    // likelier way to get this wrong than omitting it outright.
    await expect(
      loadEnv({ NODE_ENV: 'production', ...NETCASH_ENV, NETCASH_SERVICE_KEY: '' }),
    ).rejects.toThrow(/NETCASH_SERVICE_KEY|Invalid environment variables/i)
  })

  it('builds once both are set', async () => {
    const mod = await loadEnv({ NODE_ENV: 'production', ...NETCASH_ENV })
    expect(mod.env.NETCASH_SERVICE_KEY).toBe('service-key')
    expect(mod.env.NETCASH_WEBHOOK_SECRET).toBe('webhook-secret')
  })
})

describe('the mock gateway exemption', () => {
  it('does not require credentials the mock never uses', async () => {
    const mod = await loadEnv({ NODE_ENV: 'development', PAYMENT_GATEWAY: 'mock' })
    expect(mod.env.NETCASH_SERVICE_KEY).toBeUndefined()
  })

  it('is not a way to deploy without them', async () => {
    // The exemption applies in a production build too, but it buys nothing:
    // integrations/payment refuses to start with the mock selected there, so the
    // deploy fails either way. This asserts that second gate still holds, so the
    // exemption cannot quietly become a loophole.
    const previous = process.env
    process.env = { ...BASE_ENV, NODE_ENV: 'production', PAYMENT_GATEWAY: 'mock' } as NodeJS.ProcessEnv
    vi.resetModules()
    try {
      await expect(import('@/integrations/payment')).rejects.toThrow(/Refusing to start/)
    } finally {
      process.env = previous
    }
  })
})
