import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

vi.mock('@/lib/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace(/^enc:/, '')),
  maskAccountNumber: vi.fn((v: string) => `****${v.slice(-4)}`),
  // Readable here; the degrade path has its own suite in encryption-degrade.
  tryDecrypt: vi.fn((v: string) => v.replace(/^enc:/, '')),
  maskStoredSecret: vi.fn((v: string) => `****${v.replace(/^enc:/, '').slice(-4)}`),
  UNREADABLE_SECRET: 'unavailable',
}))
vi.mock('@/repositories/bank-account.repository', () => ({
  bankAccountRepo: {
    findByUser: vi.fn(),
    findByIdAndUser: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateManyByUser: vi.fn(),
    delete: vi.fn(),
  },
}))
vi.mock('@/repositories/user.repository', () => ({
  userRepo: { findById: vi.fn(), update: vi.fn() },
  runTransaction: vi.fn(),
}))
vi.mock('@/repositories/contribution.repository', () => ({ contributionRepo: { findMany: vi.fn(), aggregate: vi.fn() } }))
vi.mock('@/repositories/mandate.repository', () => ({ mandateRepo: { findActiveByUser: vi.fn(), findByUser: vi.fn() } }))
vi.mock('@/repositories/notification.repository', () => ({ notificationRepo: { findPreferences: vi.fn(), upsertPreferences: vi.fn() } }))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import { bankAccountRepo } from '@/repositories/bank-account.repository'
import { runTransaction } from '@/repositories/user.repository'
import { writeAuditLog } from '@/services/audit.service'
import { addBankAccount, updateBankAccount, removeBankAccount } from '@/services/member.service'
import { BankAccountConflictError, BankAccountNotFoundError } from '@/lib/errors'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>

const OWNER = 'u1'

const input = {
  bankName: 'Standard Bank',
  accountNumber: '1234567890',
  accountType: 'SAVINGS' as const,
  branchCode: '051001',
  isPrimary: false,
}

const stored = (over: Record<string, unknown> = {}) => ({
  id: 'ba-1',
  userId: OWNER,
  bankName: 'Standard Bank',
  accountNumber: 'enc:1234567890',
  accountType: 'SAVINGS',
  branchCode: '051001',
  isPrimary: false,
  verifiedAt: null,
  mandates: [],
  createdAt: new Date(),
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  // Run the transaction body against the same repo mocks.
  mock(runTransaction).mockImplementation((async (fn: (tx: unknown) => unknown) => fn({})) as never)
  mock(bankAccountRepo.findByUser).mockResolvedValue([] as never)
  mock(bankAccountRepo.create).mockResolvedValue(stored() as never)
  mock(bankAccountRepo.update).mockResolvedValue(stored() as never)
  mock(bankAccountRepo.updateManyByUser).mockResolvedValue({ count: 0 } as never)
  mock(bankAccountRepo.delete).mockResolvedValue({} as never)
  mock(bankAccountRepo.findFirst).mockResolvedValue(null as never)
})

// ---------------------------------------------------------------------------
// Adding
// ---------------------------------------------------------------------------

describe('addBankAccount', () => {
  it('encrypts the account number before it is stored', async () => {
    await addBankAccount(OWNER, input)
    expect(bankAccountRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ accountNumber: 'enc:1234567890' }),
      expect.anything(),
    )
  })

  it('never returns the full number, only a mask', async () => {
    const res = await addBankAccount(OWNER, input)
    expect(res.accountNumberMasked).not.toContain('1234567890')
    expect(res).not.toHaveProperty('accountNumber')
  })

  it('spots a duplicate by comparing decrypted numbers, not ciphertext', async () => {
    // Encryption uses a random IV, so the same account number encrypts to
    // different bytes every time. Comparing stored values would never match and
    // a member could register the same account repeatedly.
    mock(bankAccountRepo.findByUser).mockResolvedValue([stored()] as never)

    await expect(addBankAccount(OWNER, input)).rejects.toBeInstanceOf(BankAccountConflictError)
    expect(bankAccountRepo.create).not.toHaveBeenCalled()
  })

  it('allows a different account at the same bank', async () => {
    mock(bankAccountRepo.findByUser).mockResolvedValue([stored({ accountNumber: 'enc:9999999999' })] as never)
    await expect(addBankAccount(OWNER, input)).resolves.toBeDefined()
  })

  it('makes the first account primary whether or not it was asked for', async () => {
    mock(bankAccountRepo.findByUser).mockResolvedValue([] as never)
    await addBankAccount(OWNER, { ...input, isPrimary: false })
    expect(bankAccountRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ isPrimary: true }),
      expect.anything(),
    )
  })

  it('leaves a later account secondary unless asked', async () => {
    mock(bankAccountRepo.findByUser).mockResolvedValue([stored({ accountNumber: 'enc:9999999999' })] as never)
    await addBankAccount(OWNER, { ...input, isPrimary: false })
    expect(bankAccountRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ isPrimary: false }),
      expect.anything(),
    )
    expect(bankAccountRepo.updateManyByUser).not.toHaveBeenCalled()
  })

  it('demotes the incumbent when a new account is made primary', async () => {
    mock(bankAccountRepo.findByUser).mockResolvedValue([stored({ accountNumber: 'enc:9999999999', isPrimary: true })] as never)
    await addBankAccount(OWNER, { ...input, isPrimary: true })
    expect(bankAccountRepo.updateManyByUser).toHaveBeenCalledWith(OWNER, { isPrimary: false }, expect.anything())
  })

  it('demotes and creates inside one transaction, so there is never no primary', async () => {
    mock(bankAccountRepo.findByUser).mockResolvedValue([stored({ accountNumber: 'enc:9999999999', isPrimary: true })] as never)
    await addBankAccount(OWNER, { ...input, isPrimary: true })
    expect(runTransaction).toHaveBeenCalledOnce()
  })

  it('records the addition without putting the number in the audit trail', async () => {
    await addBankAccount(OWNER, input, '41.0.0.1')
    const [entry] = mock(writeAuditLog).mock.calls[0] as unknown as [{ action: string; payload: Record<string, unknown> }]
    expect(entry.action).toBe('BANK_ACCOUNT_ADDED')
    expect(JSON.stringify(entry.payload)).not.toContain('1234567890')
  })
})

// ---------------------------------------------------------------------------
// Updating
// ---------------------------------------------------------------------------

describe('updateBankAccount', () => {
  it('refuses an account that is not the caller’s', async () => {
    // The lookup is scoped to the owner, so another member's id simply misses.
    mock(bankAccountRepo.findByIdAndUser).mockResolvedValue(null as never)
    await expect(updateBankAccount('ba-1', 'someone-else', { bankName: 'X' }))
      .rejects.toBeInstanceOf(BankAccountNotFoundError)
    expect(bankAccountRepo.update).not.toHaveBeenCalled()
  })

  it('refuses to change the details of a verified account', async () => {
    mock(bankAccountRepo.findByIdAndUser).mockResolvedValue(stored({ verifiedAt: new Date() }) as never)
    await expect(updateBankAccount('ba-1', OWNER, { bankName: 'Other Bank' }))
      .rejects.toBeInstanceOf(BankAccountConflictError)
  })

  it('still lets a verified account be made primary', async () => {
    // Verification protects the banking details, not which account is preferred.
    mock(bankAccountRepo.findByIdAndUser).mockResolvedValue(stored({ verifiedAt: new Date() }) as never)
    await expect(updateBankAccount('ba-1', OWNER, { isPrimary: true })).resolves.toBeUndefined()
  })

  it('demotes the others when this one becomes primary', async () => {
    mock(bankAccountRepo.findByIdAndUser).mockResolvedValue(stored() as never)
    await updateBankAccount('ba-1', OWNER, { isPrimary: true })
    expect(bankAccountRepo.updateManyByUser).toHaveBeenCalledWith(OWNER, { isPrimary: false }, expect.anything())
  })

  it('writes only the fields that were supplied', async () => {
    mock(bankAccountRepo.findByIdAndUser).mockResolvedValue(stored() as never)
    await updateBankAccount('ba-1', OWNER, { bankName: 'Other Bank' })
    const [, data] = mock(bankAccountRepo.update).mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(data).toEqual({ bankName: 'Other Bank' })
  })
})

// ---------------------------------------------------------------------------
// Removing
// ---------------------------------------------------------------------------

describe('removeBankAccount', () => {
  it('refuses an account that is not the caller’s', async () => {
    mock(bankAccountRepo.findByIdAndUser).mockResolvedValue(null as never)
    await expect(removeBankAccount('ba-1', 'someone-else')).rejects.toBeInstanceOf(BankAccountNotFoundError)
  })

  it('refuses while a mandate is still active or pending', async () => {
    // Removing the account a live debit order points at would orphan the mandate.
    mock(bankAccountRepo.findByIdAndUser).mockResolvedValue(
      stored({ mandates: [{ id: 'm1', status: 'ACTIVE' }] }) as never,
    )
    await expect(removeBankAccount('ba-1', OWNER)).rejects.toBeInstanceOf(BankAccountConflictError)
    expect(bankAccountRepo.delete).not.toHaveBeenCalled()
  })

  it('removes an account with no live mandate', async () => {
    mock(bankAccountRepo.findByIdAndUser).mockResolvedValue(stored() as never)
    await removeBankAccount('ba-1', OWNER)
    expect(bankAccountRepo.delete).toHaveBeenCalledWith('ba-1', expect.anything())
  })

  it('promotes the next oldest account when the primary is removed', async () => {
    // Otherwise the member is left with accounts but no primary, and nothing to
    // debit against.
    mock(bankAccountRepo.findByIdAndUser).mockResolvedValue(stored({ isPrimary: true }) as never)
    mock(bankAccountRepo.findFirst).mockResolvedValue({ id: 'ba-2' } as never)

    await removeBankAccount('ba-1', OWNER)

    expect(bankAccountRepo.update).toHaveBeenCalledWith('ba-2', { isPrimary: true }, expect.anything())
  })

  it('promotes nothing when the removed account was the last one', async () => {
    mock(bankAccountRepo.findByIdAndUser).mockResolvedValue(stored({ isPrimary: true }) as never)
    mock(bankAccountRepo.findFirst).mockResolvedValue(null as never)

    await removeBankAccount('ba-1', OWNER)

    expect(bankAccountRepo.update).not.toHaveBeenCalled()
  })

  it('does not promote anything when a secondary account is removed', async () => {
    mock(bankAccountRepo.findByIdAndUser).mockResolvedValue(stored({ isPrimary: false }) as never)
    await removeBankAccount('ba-1', OWNER)
    expect(bankAccountRepo.findFirst).not.toHaveBeenCalled()
  })

  it('deletes and promotes inside one transaction', async () => {
    mock(bankAccountRepo.findByIdAndUser).mockResolvedValue(stored({ isPrimary: true }) as never)
    mock(bankAccountRepo.findFirst).mockResolvedValue({ id: 'ba-2' } as never)
    await removeBankAccount('ba-1', OWNER)
    expect(runTransaction).toHaveBeenCalledOnce()
  })
})
