import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — hoisted before module evaluation
// ---------------------------------------------------------------------------

vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn().mockResolvedValue('hashed'), compare: vi.fn() },
}))

vi.mock('@/lib/env', () => ({ env: { FOUNDER_EMAIL: 'founder@example.com' } }))
vi.mock('@/lib/encryption', () => ({ encrypt: vi.fn((v: string) => `enc:${v}`) }))
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))
vi.mock('@/integrations/email', () => ({
  emailProvider: {
    sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  },
}))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/role-version', () => ({ bumpRoleVersion: vi.fn().mockResolvedValue(undefined) }))

vi.mock('@/repositories/user.repository', () => ({
  userRepo: { findByEmail: vi.fn(), findByEmailOrPhone: vi.fn() },
  // runTransaction just runs the callback with a stub tx.
  runTransaction: vi.fn((fn: (tx: unknown) => unknown) =>
    fn({ user: { update: vi.fn().mockResolvedValue({}) } }),
  ),
}))

vi.mock('@/repositories/auth-token.repository', () => ({
  authTokenRepo: {
    findResetToken: vi.fn(),
    createResetToken: vi.fn(),
    invalidateResetTokens: vi.fn().mockResolvedValue({ count: 0 }),
    consumeResetToken: vi.fn(),
    findVerificationToken: vi.fn(),
    consumeVerificationToken: vi.fn(),
  },
}))

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { userRepo } from '@/repositories/user.repository'
import { authTokenRepo } from '@/repositories/auth-token.repository'
import { bumpRoleVersion } from '@/lib/role-version'
import { requestPasswordReset, resetPassword } from '@/services/auth.service'
import { InvalidTokenError } from '@/lib/errors'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>

beforeEach(() => vi.clearAllMocks())

describe('requestPasswordReset — no user enumeration (SEC-S07)', () => {
  it('returns silently and issues no token when the email is unknown', async () => {
    mock(userRepo.findByEmail).mockResolvedValue(null as never)

    await expect(requestPasswordReset('ghost@example.com', 'https://x')).resolves.toBeUndefined()
    expect(authTokenRepo.createResetToken).not.toHaveBeenCalled()
  })
})

describe('resetPassword — atomic token consumption (TOCTOU guard)', () => {
  const validRecord = {
    userId: 'user-1',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
  }

  it('rejects when the token was already consumed by a concurrent request', async () => {
    mock(authTokenRepo.findResetToken).mockResolvedValue(validRecord as never)
    // This caller lost the race — the atomic consume flips zero rows.
    mock(authTokenRepo.consumeResetToken).mockResolvedValue(false as never)

    await expect(resetPassword('rawtoken', 'NewPassw0rd')).rejects.toBeInstanceOf(InvalidTokenError)
    // Password must NOT be changed, session must NOT be invalidated, if we lost.
    expect(bumpRoleVersion).not.toHaveBeenCalled()
  })

  it('resets the password and invalidates sessions when it wins the consume', async () => {
    mock(authTokenRepo.findResetToken).mockResolvedValue(validRecord as never)
    mock(authTokenRepo.consumeResetToken).mockResolvedValue(true as never)

    await resetPassword('rawtoken', 'NewPassw0rd')

    expect(authTokenRepo.consumeResetToken).toHaveBeenCalledTimes(1)
    // Session invalidation after a successful reset (forces re-auth everywhere).
    expect(bumpRoleVersion).toHaveBeenCalledWith('user-1')
  })

  it('rejects an expired token before touching the database', async () => {
    mock(authTokenRepo.findResetToken).mockResolvedValue({
      ...validRecord,
      expiresAt: new Date(Date.now() - 1),
    } as never)

    await expect(resetPassword('rawtoken', 'NewPassw0rd')).rejects.toBeInstanceOf(InvalidTokenError)
    expect(authTokenRepo.consumeResetToken).not.toHaveBeenCalled()
  })
})
