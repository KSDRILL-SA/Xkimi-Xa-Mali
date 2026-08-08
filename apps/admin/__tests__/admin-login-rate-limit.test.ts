import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The admin sign-in had no throttle either.
 *
 * The middleware matcher excludes `api/auth`, so the credentials callback was
 * reachable at any rate. The per-account lockout does not cover it: that never
 * fires for an address with no row, so guessing at which addresses hold the
 * ADMIN role cost nothing at all.
 *
 * This is the console that can reverse a transaction and suspend a member, and
 * by decision there is exactly one account that can open it.
 */

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/env', () => ({
  env: {
    AUTH_SECRET: 'x'.repeat(32),
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION_MINUTES: 15,
    UPSTASH_REDIS_REST_URL: undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined,
  },
}))
vi.mock('@/lib/rate-limit', () => ({ adminLoginRatelimit: { limit: mocks.limit } }))
vi.mock('@/lib/role-version', () => ({ seedRoleVersion: vi.fn() }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: mocks.warn, error: vi.fn() },
}))
vi.mock('next-auth', () => ({
  default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }),
}))
vi.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }))
vi.mock('next-auth/providers/credentials', () => ({ default: (config: unknown) => config }))

import { assertAdminLoginAllowed } from '@/lib/auth'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.limit.mockResolvedValue({ success: true })
})

describe('throttling admin sign-in', () => {
  it('lets an attempt through while the source is under its allowance', async () => {
    await expect(assertAdminLoginAllowed('102.53.1.9')).resolves.toBeUndefined()
    expect(mocks.limit).toHaveBeenCalledWith('102.53.1.9')
  })

  it('refuses once the source has spent its allowance', async () => {
    mocks.limit.mockResolvedValue({ success: false })

    await expect(assertAdminLoginAllowed('102.53.1.9')).rejects.toThrow('RATE_LIMITED')
    expect(mocks.warn).toHaveBeenCalledWith('Admin sign-in throttled', { identifier: '102.53.1.9' })
  })
})

describe('the throttle is wired in, and keyed on the source', () => {
  const source = async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    return readFileSync(resolve(__dirname, '../lib/auth.ts'), 'utf8')
  }

  it('runs before the account is looked up', async () => {
    const text = await source()
    const block = text.slice(text.indexOf('async authorize('))

    const throttleAt = block.indexOf('assertAdminLoginAllowed')
    const lookupAt = block.indexOf('db.user.findUnique')

    expect(throttleAt).toBeGreaterThan(-1)
    expect(throttleAt).toBeLessThan(lookupAt)
  })

  it('keys on the request source, not on the submitted email', async () => {
    // Every other limiter in this app is keyed on the admin's user id, because
    // they sit behind a session. There is no session yet at sign-in, and an
    // account-keyed limit here would be a way to hold the single admin out of
    // their own console — the failure the existing lockout already has.
    const text = await source()
    const block = text.slice(text.indexOf('async authorize('), text.indexOf('const parsed'))

    expect(block).toContain('clientIpFromHeaders')
    expect(block).not.toMatch(/assertAdminLoginAllowed\([^)]*email/)
  })

  it('is stricter than the member app, which is the point of a separate limiter', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const rateLimits = readFileSync(resolve(__dirname, '../lib/rate-limit.ts'), 'utf8')

    // One admin, who knows their password, guarding the ability to move money.
    expect(rateLimits).toContain("'xxm:ratelimit:admin-login'")
    expect(rateLimits).toMatch(/adminLoginRatelimit[\s\S]{0,300}slidingWindow\(5, '5 m'\)/)
  })
})
