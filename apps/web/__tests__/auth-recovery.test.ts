import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Two ways an account could get stuck in a state nothing would take it out of.
 *
 * Resetting the password did not lift a lockout, so "too many failed attempts —
 * try again later or reset your password" was advice that did not work. And
 * verifying an email set the account ACTIVE whatever it had been, so a
 * suspension could be undone by the suspended person clicking a link.
 */

const mocks = vi.hoisted(() => ({
  findResetToken: vi.fn(),
  consumeResetToken: vi.fn(),
  findVerificationToken: vi.fn(),
  consumeVerificationToken: vi.fn(),
  userUpdate: vi.fn(),
  userUpdateMany: vi.fn(),
  runTransaction: vi.fn(),
  writeAuditLog: vi.fn(),
  bumpRoleVersion: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: {} }))
vi.mock('@/integrations/email', () => ({ emailProvider: { sendPasswordResetEmail: vi.fn() } }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/role-version', () => ({ bumpRoleVersion: mocks.bumpRoleVersion }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'hashed') } }))
vi.mock('@/repositories/user.repository', () => ({
  userRepo: { findByEmail: vi.fn(), findByIdOrThrow: vi.fn(), update: vi.fn() },
  runTransaction: mocks.runTransaction,
}))
vi.mock('@/repositories/auth-token.repository', () => ({
  authTokenRepo: {
    findResetToken: mocks.findResetToken,
    consumeResetToken: mocks.consumeResetToken,
    invalidateResetTokens: vi.fn(),
    createResetToken: vi.fn(),
    findVerificationToken: mocks.findVerificationToken,
    consumeVerificationToken: mocks.consumeVerificationToken,
  },
}))

import { resetPassword, verifyEmail } from '@/services/auth.service'

/** The transaction client the service writes through. */
const tx = {
  user: { update: mocks.userUpdate, updateMany: mocks.userUpdateMany },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.runTransaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn(tx))
  mocks.consumeResetToken.mockResolvedValue(true)
  mocks.consumeVerificationToken.mockResolvedValue(true)
  mocks.userUpdate.mockResolvedValue({})
  mocks.userUpdateMany.mockResolvedValue({ count: 1 })
})

describe('resetting a password lets a locked-out member back in', () => {
  beforeEach(() => {
    mocks.findResetToken.mockResolvedValue({
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    })
  })

  it('clears the lockout as well as setting the password', async () => {
    // The advice on the login page is "try again later or reset your password".
    // Resetting did not lift the lock, so a member who did exactly what they
    // were told still could not get in.
    await resetPassword('raw-token', 'a-long-enough-password')

    const data = mocks.userUpdate.mock.calls[0][0].data
    expect(data).toMatchObject({ loginAttempts: 0, lockedUntil: null })
    expect(data.password).toBe('hashed')
  })

  it('is the self-service way out of a lockout nobody else can clear', async () => {
    // With one admin, an attacker who keeps that account locked otherwise takes
    // the console away from the only person who could unlock it. Reaching here
    // required a token sent to the address on the account, which is a stronger
    // claim than the failed guesses that set the lock.
    await resetPassword('raw-token', 'a-long-enough-password')

    expect(mocks.userUpdate).toHaveBeenCalledOnce()
    expect(mocks.userUpdate.mock.calls[0][0].where).toEqual({ id: 'user-1' })
  })

  it('still records the password as meeting the current policy', async () => {
    await resetPassword('raw-token', 'a-long-enough-password')

    expect(mocks.userUpdate.mock.calls[0][0].data.passwordChangedAt).toBeInstanceOf(Date)
  })

  it('still invalidates every live session', async () => {
    await resetPassword('raw-token', 'a-long-enough-password')
    expect(mocks.bumpRoleVersion).toHaveBeenCalledWith('user-1')
  })
})

describe('verifying an email proves the address, and decides nothing else', () => {
  beforeEach(() => {
    mocks.findVerificationToken.mockResolvedValue({
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
    })
  })

  it('activates only an account that is still PENDING', async () => {
    await verifyEmail('raw-token')

    const activation = mocks.userUpdateMany.mock.calls[0][0]
    expect(activation.where).toEqual({ id: 'user-1', status: 'PENDING' })
    expect(activation.data.status).toBe('ACTIVE')
  })

  it('will not reactivate a suspended account', async () => {
    // This wrote status ACTIVE unconditionally, so a member suspended between
    // registering and clicking the link came back ACTIVE by clicking it — the
    // suspension undone by the suspended person, leaving only an EMAIL_VERIFIED
    // audit entry behind.
    await verifyEmail('raw-token')

    // The status is decided in the same statement that changes it, so a
    // suspension landing mid-transaction cannot be read as stale and missed.
    for (const [call] of mocks.userUpdateMany.mock.calls) {
      if (call.data.status === 'ACTIVE') {
        expect(call.where.status).toBe('PENDING')
      }
    }
  })

  it('still marks the address verified whatever the status is', async () => {
    // A suspended member who confirms their email has confirmed it, and should
    // not be asked again if they are later reinstated.
    await verifyEmail('raw-token')

    const verification = mocks.userUpdateMany.mock.calls.find(
      ([call]) => call.data.status === undefined,
    )
    expect(verification).toBeDefined()
    expect(verification![0].where).toEqual({ id: 'user-1', emailVerified: null })
    expect(verification![0].data.emailVerified).toBeInstanceOf(Date)
  })

  it('still refuses a token that was already used', async () => {
    mocks.consumeVerificationToken.mockResolvedValue(false)

    await expect(verifyEmail('raw-token')).rejects.toThrow(/already been used/)
  })
})
