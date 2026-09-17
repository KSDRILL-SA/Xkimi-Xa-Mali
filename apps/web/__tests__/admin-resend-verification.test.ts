import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The other way back in, for a member an admin can actually see.
 *
 * `resendVerificationEmail` (verification-recovery.test.ts) is keyed by email
 * and answers every caller identically on purpose — silence is correct when
 * the caller might not be who they claim. An admin looking at one specific
 * stuck member is a different caller: they already know who this is, and
 * "already verified" versus "already active" is information they need, not a
 * privacy leak. `adminResendVerification` exists for that caller, reusing the
 * same token and email machinery under a different set of answers.
 */

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  invalidateVerificationTokens: vi.fn(),
  createVerificationToken: vi.fn(),
  sendVerificationEmail: vi.fn(),
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: {} }))
vi.mock('@/integrations/email', () => ({
  emailProvider: { sendVerificationEmail: mocks.sendVerificationEmail },
}))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/repositories/user.repository', () => ({
  userRepo: { findById: mocks.findById },
  runTransaction: vi.fn(),
}))
vi.mock('@/repositories/auth-token.repository', () => ({
  authTokenRepo: {
    invalidateVerificationTokens: mocks.invalidateVerificationTokens,
    createVerificationToken: mocks.createVerificationToken,
  },
}))
// admin.service.ts pulls in the whole module at import time, including the
// payment gateway selection that throws outside a configured environment.
vi.mock('@/integrations/payment', () => ({
  paymentGateway: { cancelMandate: vi.fn() },
}))

import { adminResendVerification } from '@/services/admin.service'
import { AdminNotFoundError, AdminConflictError } from '@/lib/errors'

const STUCK = {
  id: 'user-1',
  email: 'thabo@example.com',
  firstName: 'Thabo',
  status: 'PENDING',
  emailVerified: null,
}

const ADMIN = ['ADMIN']

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findById.mockResolvedValue(STUCK)
  mocks.invalidateVerificationTokens.mockResolvedValue({ count: 1 })
  mocks.createVerificationToken.mockResolvedValue({})
  mocks.sendVerificationEmail.mockResolvedValue(undefined)
})

describe('an admin resending a stuck member their verification link', () => {
  it('issues a fresh link and sends it', async () => {
    await adminResendVerification('admin-1', ADMIN, 'user-1', 'https://admin.test')

    expect(mocks.createVerificationToken).toHaveBeenCalledOnce()
    expect(mocks.sendVerificationEmail).toHaveBeenCalledWith(
      'thabo@example.com', 'Thabo', expect.any(String), 'https://admin.test',
    )
  })

  it('retires the previous link first, so asking twice cannot leave two live', async () => {
    await adminResendVerification('admin-1', ADMIN, 'user-1', 'https://admin.test')

    expect(mocks.invalidateVerificationTokens).toHaveBeenCalledWith('user-1')
    expect(mocks.invalidateVerificationTokens.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.createVerificationToken.mock.invocationCallOrder[0])
  })

  it('records which admin acted, against the member', async () => {
    await adminResendVerification('admin-1', ADMIN, 'user-1', 'https://admin.test')

    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1', action: 'ADMIN_VERIFICATION_RESENT', entityId: 'user-1',
      }),
    )
  })

  it('refuses a non-admin before touching anything', async () => {
    await expect(adminResendVerification('m1', ['MEMBER'], 'user-1', 'https://admin.test'))
      .rejects.toThrow()
    expect(mocks.findById).not.toHaveBeenCalled()
  })

  it('says so when the member does not exist', async () => {
    mocks.findById.mockResolvedValue(null)

    await expect(adminResendVerification('admin-1', ADMIN, 'ghost', 'https://admin.test'))
      .rejects.toBeInstanceOf(AdminNotFoundError)
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled()
  })

  it('says so rather than silently doing nothing for an already-verified member', async () => {
    // The whole reason this exists instead of reusing resendVerificationEmail:
    // an admin needs to know *why* nothing happened, not get the same blank
    // success that function gives a stranger.
    mocks.findById.mockResolvedValue({ ...STUCK, emailVerified: new Date(), status: 'ACTIVE' })

    await expect(adminResendVerification('admin-1', ADMIN, 'user-1', 'https://admin.test'))
      .rejects.toBeInstanceOf(AdminConflictError)
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled()
  })

  it('says so rather than reactivating a suspended member through the back door', async () => {
    mocks.findById.mockResolvedValue({ ...STUCK, status: 'SUSPENDED' })

    await expect(adminResendVerification('admin-1', ADMIN, 'user-1', 'https://admin.test'))
      .rejects.toBeInstanceOf(AdminConflictError)
    expect(mocks.sendVerificationEmail).not.toHaveBeenCalled()
    expect(mocks.invalidateVerificationTokens).not.toHaveBeenCalled()
  })
})
