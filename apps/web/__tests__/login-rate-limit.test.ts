import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The sign-in path had no throttle of any kind.
 *
 * `authRatelimit` guards registration, password reset and invite validation.
 * None of them is the login. NextAuth's `/api/auth/*` is passed straight
 * through by the middleware before any limiter runs, so the credentials
 * callback was reachable at whatever rate a client could manage.
 *
 * The per-account lockout is not a substitute. It is per *account*, so one
 * password tried against fifty member addresses never trips it, and it never
 * fires at all for an address with no row — so guessing at who is registered
 * cost nothing.
 */

const mocks = vi.hoisted(() => ({
  limit: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('@/lib/env', () => ({
  env: { AUTH_SECRET: 'x'.repeat(32), MAX_LOGIN_ATTEMPTS: 5, LOCKOUT_DURATION_MINUTES: 15 },
}))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/redis', () => ({ loginRatelimit: { limit: mocks.limit } }))
vi.mock('@/lib/role-version', () => ({ seedRoleVersion: vi.fn() }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: mocks.warn, error: vi.fn() },
}))
vi.mock('next-auth', () => ({
  default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }),
}))
vi.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }))
vi.mock('next-auth/providers/credentials', () => ({ default: (config: unknown) => config }))

import { assertLoginAllowed } from '@/lib/auth'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.limit.mockResolvedValue({ success: true })
})

describe('throttling sign-in attempts', () => {
  it('lets an attempt through while the source is under its allowance', async () => {
    await expect(assertLoginAllowed('102.53.1.9')).resolves.toBeUndefined()
    expect(mocks.limit).toHaveBeenCalledWith('102.53.1.9')
  })

  it('refuses once the source has spent its allowance', async () => {
    mocks.limit.mockResolvedValue({ success: false })

    await expect(assertLoginAllowed('102.53.1.9')).rejects.toThrow('RATE_LIMITED')
  })

  it('refuses with a code distinct from a wrong password', async () => {
    // `null` from authorize surfaces as CredentialsSignin — "incorrect email or
    // password". Saying that to someone whose password was never checked sends
    // them to the reset flow for a problem that clears itself in five minutes.
    mocks.limit.mockResolvedValue({ success: false })

    await expect(assertLoginAllowed('1.2.3.4')).rejects.toThrow(/^RATE_LIMITED$/)
  })

  it('records the refusal, because a spray is worth seeing in the logs', async () => {
    mocks.limit.mockResolvedValue({ success: false })

    await expect(assertLoginAllowed('1.2.3.4')).rejects.toThrow()
    expect(mocks.warn).toHaveBeenCalledWith('Sign-in throttled', { identifier: '1.2.3.4' })
  })

  it('does not consult the account, because the attack never names one twice', async () => {
    // The whole point of keying on the source. A spray tries one password
    // against many addresses; nothing about any single account looks unusual.
    await assertLoginAllowed('102.53.1.9')

    expect(mocks.limit).toHaveBeenCalledOnce()
    expect(mocks.limit).toHaveBeenCalledWith('102.53.1.9')
  })
})

describe('the throttle is actually wired into sign-in', () => {
  // Unit-tested is not reachable (§4.9). A limiter that exists and is never
  // called by the provider is the same as no limiter, and that is precisely the
  // state this file was written to end.
  const source = async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    return readFileSync(resolve(__dirname, '../lib/auth.ts'), 'utf8')
  }

  it('calls the throttle from the credentials provider, before authorizing', async () => {
    const text = await source()

    const authorizeBlock = text.slice(text.indexOf('async authorize('))
    const throttleAt = authorizeBlock.indexOf('assertLoginAllowed')
    const credentialsAt = authorizeBlock.indexOf('authorizeCredentials')

    expect(throttleAt).toBeGreaterThan(-1)
    expect(credentialsAt).toBeGreaterThan(-1)
    // Before, not after: the point is to refuse without doing the lookup.
    expect(throttleAt).toBeLessThan(credentialsAt)
  })

  it('keys the throttle on the request source, never on the submitted email', async () => {
    // An account-keyed limit here would hand anyone a way to hold a member —
    // or the single admin — out of their own account, which is the failure the
    // existing lockout already has.
    const text = await source()
    const authorizeBlock = text.slice(text.indexOf('async authorize('), text.indexOf('return authorizeCredentials'))

    expect(authorizeBlock).toContain('clientIpFromHeaders')
    expect(authorizeBlock).not.toMatch(/assertLoginAllowed\([^)]*email/)
  })
})
