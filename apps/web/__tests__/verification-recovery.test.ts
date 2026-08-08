import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The account that could not be rescued.
 *
 * Registration issued one verification token and put it in one email, awaited
 * without a catch. A Resend blip threw after the transaction had committed, so
 * the caller saw a 500 and believed registration had failed. It had not:
 *
 *   - the `User` row existed, so the email and phone were taken and
 *     re-registering was impossible
 *   - the invitation was ACCEPTED, so the code could not be used again
 *   - the status was PENDING, so signing in was refused
 *   - the only copy of the token had gone with the message
 *
 * There was no resend endpoint. Nothing in the product could undo any of it,
 * and the one way back was somebody editing the database. The invite SMS and
 * the invite email both catch; this one did not, and it was the one that
 * mattered.
 */

const mocks = vi.hoisted(() => ({
  findByEmail: vi.fn(),
  invalidateVerificationTokens: vi.fn(),
  createVerificationToken: vi.fn(),
  sendVerificationEmail: vi.fn(),
  writeAuditLog: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: {} }))
vi.mock('@/integrations/email', () => ({
  emailProvider: {
    sendVerificationEmail: mocks.sendVerificationEmail,
    sendPasswordResetEmail: vi.fn(),
  },
}))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/lib/role-version', () => ({ bumpRoleVersion: vi.fn() }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: mocks.logError },
}))
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'hashed') } }))
vi.mock('@/repositories/user.repository', () => ({
  userRepo: { findByEmail: mocks.findByEmail, findByIdOrThrow: vi.fn(), update: vi.fn() },
  runTransaction: vi.fn(),
}))
vi.mock('@/repositories/auth-token.repository', () => ({
  authTokenRepo: {
    invalidateVerificationTokens: mocks.invalidateVerificationTokens,
    createVerificationToken: mocks.createVerificationToken,
    findVerificationToken: vi.fn(),
    consumeVerificationToken: vi.fn(),
    findResetToken: vi.fn(),
    consumeResetToken: vi.fn(),
    invalidateResetTokens: vi.fn(),
    createResetToken: vi.fn(),
  },
}))

import { resendVerificationEmail } from '@/services/auth.service'

const WAITING = {
  id: 'user-1',
  email: 'thabo@example.com',
  firstName: 'Thabo',
  status: 'PENDING',
  emailVerified: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findByEmail.mockResolvedValue(WAITING)
  mocks.invalidateVerificationTokens.mockResolvedValue({ count: 1 })
  mocks.createVerificationToken.mockResolvedValue({})
  mocks.sendVerificationEmail.mockResolvedValue(undefined)
})

describe('asking for the verification link again', () => {
  it('issues a fresh link to somebody still waiting', async () => {
    await resendVerificationEmail('thabo@example.com', 'https://app.test')

    expect(mocks.createVerificationToken).toHaveBeenCalledOnce()
    expect(mocks.sendVerificationEmail).toHaveBeenCalledWith(
      'thabo@example.com',
      'Thabo',
      expect.any(String),
      'https://app.test',
    )
  })

  it('retires the previous link before minting a new one', async () => {
    // Otherwise asking twice leaves two live links in two mailboxes, which is
    // the rule `invalidateResetTokens` already applies to password resets.
    await resendVerificationEmail('thabo@example.com', 'https://app.test')

    expect(mocks.invalidateVerificationTokens).toHaveBeenCalledWith('user-1')
    expect(mocks.invalidateVerificationTokens.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.createVerificationToken.mock.invocationCallOrder[0])
  })

  it('sends a token that is not the one stored', async () => {
    // Only the hash is kept. The raw token exists in the email and nowhere else.
    await resendVerificationEmail('thabo@example.com', 'https://app.test')

    const stored = mocks.createVerificationToken.mock.calls[0][0].tokenHash
    const sent = mocks.sendVerificationEmail.mock.calls[0][2]
    expect(stored).not.toBe(sent)
    expect(stored).toHaveLength(64)
  })

  it('records that a link was reissued', async () => {
    await resendVerificationEmail('thabo@example.com', 'https://app.test')

    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'VERIFICATION_EMAIL_RESENT', userId: 'user-1' }),
    )
  })
})

describe('who does not get a new link', () => {
  it('says nothing and does nothing for an address that is not registered', async () => {
    mocks.findByEmail.mockResolvedValue(null)

    await expect(resendVerificationEmail('nobody@example.com', 'https://app.test'))
      .resolves.toBeUndefined()
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled()
  })

  it('does nothing for an account that is already verified', async () => {
    mocks.findByEmail.mockResolvedValue({ ...WAITING, emailVerified: new Date(), status: 'ACTIVE' })

    await resendVerificationEmail('thabo@example.com', 'https://app.test')

    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled()
  })

  it('will not hand a suspended account a route back in', async () => {
    // #303 stopped verification from reactivating a suspended account. Sending
    // one a fresh link would be the same door in a different wall.
    mocks.findByEmail.mockResolvedValue({ ...WAITING, status: 'SUSPENDED' })

    await resendVerificationEmail('thabo@example.com', 'https://app.test')

    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled()
    expect(mocks.invalidateVerificationTokens).not.toHaveBeenCalled()
  })
})

describe('the endpoint tells a stranger nothing', () => {
  const source = async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    return readFileSync(
      resolve(__dirname, '../app/api/v1/auth/resend-verification/route.ts'),
      'utf8',
    )
  }

  it('answers the same way whether or not the address exists', async () => {
    const route = await source()
    // One response, unconditional — no branch on what the lookup found.
    expect(route).toContain('If that account is waiting to be verified')
    expect(route).not.toMatch(/if\s*\(\s*!?user/)
  })

  it('defers the work so the timing does not answer it either', async () => {
    // The lesson from forgot-password: an identical message and a very
    // different response time still tells the caller which case they hit.
    const route = await source()

    const deferAt = route.indexOf('after(')
    const workAt = route.indexOf('await resendVerificationEmail')
    const respondAt = route.indexOf('return apiSuccess')

    expect(deferAt).toBeGreaterThan(-1)
    // The work is awaited, but inside the deferred callback — so it is ordered
    // after `after(` opens and before the response is returned in source order,
    // while running after the response is sent.
    expect(deferAt).toBeLessThan(workAt)
    expect(workAt).toBeLessThan(respondAt)
  })

  it('is rate limited, because each success posts mail to a named address', async () => {
    const route = await source()
    expect(route).toContain('resendVerificationRatelimit')
  })

  it('is reachable without a session, which is the whole point', async () => {
    const { readFileSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const middleware = readFileSync(resolve(__dirname, '../middleware.ts'), 'utf8')

    expect(middleware).toContain("pathname === '/api/v1/auth/resend-verification'")
  })
})
