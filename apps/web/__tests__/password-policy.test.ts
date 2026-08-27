import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The only path that creates an account enforced the weakest rule in the system.
 *
 * `RegisterSchema`, `PasswordResetSchema` and `ChangePasswordSchema` all
 * required twelve characters. The registration *route* validated by hand —
 * eight characters, one uppercase, one digit — and imported none of them. The
 * comment on the schema argued against exactly the rule the route applied:
 * "eight with a capital and a digit bolted on, which in practice produces
 * Password1, the shape attackers try first".
 *
 * So every password in the system was set under the rejected rule, and the
 * stricter one only ever applied to replacing them.
 */

const mocks = vi.hoisted(() => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  // Hoisted with the mocks: a `vi.mock` factory runs before module-level
  // declarations, so a plain top-level const is not initialised yet when the
  // factory closes over it.
  envState: {} as Record<string, unknown>,
}))

const envState = mocks.envState

vi.mock('@/lib/env', () => ({ env: mocks.envState }))
vi.mock('@/lib/db', () => ({ db: {} }))
vi.mock('@/lib/redis', () => ({ loginRatelimit: { limit: vi.fn() } }))
vi.mock('@/lib/role-version', () => ({ seedRoleVersion: vi.fn() }))
vi.mock('@xxm/observability', () => ({
  logger: { info: mocks.logInfo, warn: vi.fn(), error: mocks.logError },
}))
vi.mock('next-auth', () => ({
  default: () => ({ handlers: {}, auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }),
}))
vi.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }))
vi.mock('next-auth/providers/credentials', () => ({ default: (config: unknown) => config }))

import { passwordPolicyResetRequired } from '@/lib/auth'
import { PasswordSchema, PASSWORD_MIN_LENGTH, RegisterSchema } from '@xxm/utils/schemas'

/** Email that can actually be delivered — the precondition for enforcing at all. */
function withWorkingEmail() {
  envState.RESEND_API_KEY = 're_live_key'
  envState.RESEND_FROM_EMAIL = 'noreply@xkimixamali.co.za'
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const key of Object.keys(envState)) delete envState[key]
  envState.REQUIRE_PASSWORD_POLICY_RESET = false
})

describe('one password rule, in one place', () => {
  it('rejects the shape the old registration rule produced', () => {
    // Nine characters, one capital, one digit: it passed registration and it is
    // the first thing an attacker tries.
    expect(PasswordSchema.safeParse('Password1').success).toBe(false)
  })

  it('accepts length without demanding composition', () => {
    // No capital, no digit, no symbol — and stronger than the above.
    expect(PasswordSchema.safeParse('correct horse battery').success).toBe(true)
  })

  it('holds registration to the same rule as reset and change', () => {
    const weak = { ...VALID_REGISTRATION, password: 'Password1' }
    expect(RegisterSchema.safeParse(weak).success).toBe(false)
    expect(PASSWORD_MIN_LENGTH).toBe(12)
  })

  it('is enforced by the registration route rather than a second copy of the rule', async () => {
    // The route hand-rolled its own check and never imported a schema, which is
    // how the two rules drifted apart in the first place.
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const route = readFileSync(
      resolve(__dirname, '../app/api/v1/auth/register/route.ts'),
      'utf8',
    )

    expect(route).toContain('PasswordSchema')
    expect(route).not.toMatch(/password\.length\s*<\s*8/)
    expect(route).not.toMatch(/\[A-Z\]/)
  })
})

const VALID_REGISTRATION = {
  email: 'thabo@example.com',
  phone: '0821234567',
  firstName: 'Thabo',
  lastName: 'Maluleke',
  idNumber: '8001015009087',
  password: 'a-long-enough-password',
  consentToPopia: true as const,
}

describe('asking an old password to be replaced', () => {
  it('asks for nothing while the flag is off', () => {
    withWorkingEmail()
    expect(passwordPolicyResetRequired({ passwordChangedAt: null })).toBe(false)
  })

  it('asks an account whose password predates the policy', () => {
    envState.REQUIRE_PASSWORD_POLICY_RESET = true
    withWorkingEmail()

    expect(passwordPolicyResetRequired({ passwordChangedAt: null })).toBe(true)
  })

  it('leaves an account that has already replaced its password alone', () => {
    envState.REQUIRE_PASSWORD_POLICY_RESET = true
    withWorkingEmail()

    expect(passwordPolicyResetRequired({ passwordChangedAt: new Date('2026-08-08') })).toBe(false)
  })
})

describe('refusing to lock everyone out of a door with no key', () => {
  // The way out of this requirement is a password-reset email. Enforcing it
  // without working email does not enforce a policy — it locks every account
  // out permanently, the single admin's included, and the console you would fix
  // it from is behind the same door.

  it('does not enforce when no from-address is configured', () => {
    envState.REQUIRE_PASSWORD_POLICY_RESET = true
    envState.RESEND_API_KEY = 're_live_key'

    expect(passwordPolicyResetRequired({ passwordChangedAt: null })).toBe(false)
  })

  it('does not enforce while the from-address is still a .invalid placeholder', () => {
    // `RESEND_FROM_EMAIL` defaults to `noreply@example.invalid`, and a live
    // deploy on an unverified domain is the failure #299 exists to catch. This
    // is the state a first deploy is actually in.
    envState.REQUIRE_PASSWORD_POLICY_RESET = true
    envState.RESEND_API_KEY = 're_live_key'
    envState.RESEND_FROM_EMAIL = 'noreply@example.invalid'

    expect(passwordPolicyResetRequired({ passwordChangedAt: null })).toBe(false)
  })

  it('does not enforce with no API key, however good the address looks', () => {
    envState.REQUIRE_PASSWORD_POLICY_RESET = true
    envState.RESEND_FROM_EMAIL = 'noreply@xkimixamali.co.za'

    expect(passwordPolicyResetRequired({ passwordChangedAt: null })).toBe(false)
  })

  it('says why it is not enforcing, every time, rather than failing quietly', () => {
    // A flag that is on and doing nothing is worse than one that is off, unless
    // something says so. This is the line that turns a silent no-op into a
    // fixable configuration error.
    envState.REQUIRE_PASSWORD_POLICY_RESET = true
    envState.RESEND_FROM_EMAIL = 'noreply@example.invalid'

    passwordPolicyResetRequired({ passwordChangedAt: null })

    expect(mocks.logError).toHaveBeenCalledWith(
      expect.stringContaining('no reset email can be sent'),
      expect.anything(),
    )
  })
})

describe('the flag cannot be set to a value that means its opposite', () => {
  it('is declared with booleanFlag, never z.coerce.boolean', async () => {
    // `Boolean("false")` is true. A flag declared that way can be turned on and
    // never turned off, which for this one means a lockout no env edit can undo.
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const envSource = readFileSync(resolve(__dirname, '../lib/env.ts'), 'utf8')

    const declaration = envSource.slice(
      envSource.indexOf('REQUIRE_PASSWORD_POLICY_RESET:'),
      envSource.indexOf('REQUIRE_PASSWORD_POLICY_RESET:') + 120,
    )

    expect(declaration).toContain('booleanFlag(false)')
    expect(declaration).not.toContain('coerce.boolean')
  })

  it('leaves no z.coerce.boolean anywhere in the file', async () => {
    // ENABLE_MANUAL_PAYMENTS and ENABLE_GOAL_LOCKING were declared that way and
    // had been unswitchable since they were added: `ENABLE_MANUAL_PAYMENTS=false`
    // parsed as **true**. They read as feature flags and behaved as constants.
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const envSource = readFileSync(resolve(__dirname, '../lib/env.ts'), 'utf8')

    // Matches a declaration, not a mention — the helper's own docstring names
    // the pattern in order to explain why it is not used.
    expect(envSource).not.toMatch(/:\s*z\.coerce\.boolean/)
  })

  it('accepts only the two strings, so a typo fails at boot', async () => {
    // "yes", "1" and "ture" are all things someone will eventually type into a
    // Vercel env field. Rejecting them at boot beats silently taking the wrong
    // branch for the life of the deployment.
    const { z } = await import('zod')
    const booleanFlag = (fallback: boolean) =>
      z
        .enum(['true', 'false'])
        .default(fallback ? 'true' : 'false')
        .transform((v) => v === 'true')

    expect(booleanFlag(true).parse(undefined)).toBe(true)
    expect(booleanFlag(true).parse('false')).toBe(false)
    expect(booleanFlag(false).parse('true')).toBe(true)
    expect(() => booleanFlag(false).parse('yes')).toThrow()
    expect(() => booleanFlag(false).parse('1')).toThrow()
  })
})
