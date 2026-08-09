import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Changing a phone number was completely silent.
 *
 * It wrote an audit entry — which no member can read — and nothing else. The old
 * number heard nothing, the new number heard nothing, and the member had no
 * signal at all that it had happened.
 *
 * The phone number is where every money-related SMS goes: the morning debit
 * warning, `mandate-cancelled`, and the `payment-failed-*` pair that lives in
 * MANDATORY_SLUGS precisely so a member cannot end up not hearing it. So anyone
 * holding a session — a borrowed phone, an unlocked laptop — could quietly
 * redirect the whole channel that would have told the member something was
 * wrong, and the act of redirecting it was itself unannounced.
 *
 * Email cannot be changed on this account at all. The phone could be changed
 * freely.
 */

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findByEmailOrPhone: vi.fn(),
  update: vi.fn(),
  smsSend: vi.fn(),
  writeAuditLog: vi.fn(),
  logError: vi.fn(),
  findByUser: vi.fn(),
}))

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn(), tryDecrypt: vi.fn(), maskAccountNumber: vi.fn(),
  maskStoredSecret: vi.fn(() => '****1234'), UNREADABLE_SECRET: 'unreadable',
}))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: mocks.logError },
}))
vi.mock('@/integrations/sms', () => ({ smsProvider: { send: mocks.smsSend } }))
vi.mock('@/repositories/user.repository', () => ({
  userRepo: {
    findById: mocks.findById,
    findByEmailOrPhone: mocks.findByEmailOrPhone,
    update: mocks.update,
  },
  runTransaction: vi.fn(),
}))
vi.mock('@/repositories/bank-account.repository', () => ({
  bankAccountRepo: { findByUser: mocks.findByUser },
}))
vi.mock('@/repositories/contribution.repository', () => ({ contributionRepo: {} }))
vi.mock('@/repositories/mandate.repository', () => ({ mandateRepo: {} }))
vi.mock('@/repositories/notification.repository', () => ({ notificationRepo: {} }))

import { updateMemberProfile, listBankAccounts } from '@/services/member.service'
import { ForbiddenError } from '@/lib/errors'

const OLD_PHONE = '27821110000'
const NEW_PHONE = '27829998888'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findByEmailOrPhone.mockResolvedValue(null)
  mocks.findById.mockResolvedValue({ phone: OLD_PHONE })
  mocks.update.mockResolvedValue({ id: 'user-1', phone: NEW_PHONE })
  mocks.smsSend.mockResolvedValue(undefined)
  mocks.writeAuditLog.mockResolvedValue(undefined)
})

describe('warning the number that was replaced', () => {
  it('sends to the old number, not the new one', async () => {
    // Whoever still holds the old number is the person to tell: if the change
    // was not theirs, that is where they are.
    await updateMemberProfile('user-1', 'user-1', [], { phone: NEW_PHONE })

    expect(mocks.smsSend).toHaveBeenCalledOnce()
    expect(mocks.smsSend.mock.calls[0][0].to).toBe(OLD_PHONE)
  })

  it('names the Foundation and says what to do if it was not them', async () => {
    await updateMemberProfile('user-1', 'user-1', [], { phone: NEW_PHONE })

    const body = mocks.smsSend.mock.calls[0][0].body
    expect(body).toContain('Xkimm Xa Mali Foundation')
    expect(body).toMatch(/if this was not you/i)
  })

  it('says nothing when the phone was not part of the change', async () => {
    await updateMemberProfile('user-1', 'user-1', [], { firstName: 'Thabo' })

    expect(mocks.smsSend).not.toHaveBeenCalled()
    // The previous number is not even looked up when it cannot have changed.
    expect(mocks.findById).not.toHaveBeenCalled()
  })

  it('says nothing when the number submitted is the one already on file', async () => {
    mocks.findById.mockResolvedValue({ phone: NEW_PHONE })

    await updateMemberProfile('user-1', 'user-1', [], { phone: NEW_PHONE })

    expect(mocks.smsSend).not.toHaveBeenCalled()
  })

  it('does not block the member when the SMS gateway is down', async () => {
    // A member must not be stopped from correcting their own number because
    // BulkSMS is having a bad afternoon.
    mocks.smsSend.mockRejectedValue(new Error('BulkSMS unreachable'))

    await expect(
      updateMemberProfile('user-1', 'user-1', [], { phone: NEW_PHONE }),
    ).resolves.toBeDefined()
    expect(mocks.logError).toHaveBeenCalled()
  })

  it('still refuses a number already in use', async () => {
    mocks.findByEmailOrPhone.mockResolvedValue({ id: 'someone-else' })

    await expect(
      updateMemberProfile('user-1', 'user-1', [], { phone: NEW_PHONE }),
    ).rejects.toThrow(/already in use/i)
    expect(mocks.smsSend).not.toHaveBeenCalled()
  })
})

describe('who may list a member’s bank accounts', () => {
  beforeEach(() => mocks.findByUser.mockResolvedValue([]))

  it('lets a member list their own', async () => {
    await expect(listBankAccounts('user-1', 'user-1', [])).resolves.toEqual([])
  })

  it('refuses another member', async () => {
    // This took a bare userId and checked nothing — the only query in the file
    // without an authorization parameter, sitting beside a dozen that have one
    // and looking identical at the call site.
    await expect(listBankAccounts('user-1', 'user-2', [])).rejects.toThrow(ForbiddenError)
  })

  it('allows an admin', async () => {
    await expect(listBankAccounts('user-1', 'admin-1', ['ADMIN'])).resolves.toEqual([])
  })

  it('still works for a caller that names no requester', async () => {
    // Every existing caller passes the session's own id and is unchanged.
    await expect(listBankAccounts('user-1')).resolves.toEqual([])
  })
})
