import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    paymentMandate: { findUnique: vi.fn(), update: vi.fn() },
    inboxMessage: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
  Prisma: {},
}))
vi.mock('@/lib/signature-storage', () => ({ storeSignaturePng: vi.fn() }))

import { db } from '@/lib/db'
import {
  unlockMember,
  approveMandate,
  rejectMandate,
  AdminForbiddenError,
  AdminNotFoundError,
  AdminConflictError,
} from '@/lib/services'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>
const ADMIN = ['ADMIN']
const NOT_ADMIN = ['MEMBER']

beforeEach(() => vi.clearAllMocks())

describe('admin authorization guard (assertAdmin)', () => {
  it('rejects a non-admin caller before any data access', async () => {
    await expect(unlockMember('a1', NOT_ADMIN, 'm1')).rejects.toBeInstanceOf(AdminForbiddenError)
    expect(db.user.findUnique).not.toHaveBeenCalled()
  })
})

describe('approveMandate — status guard', () => {
  it('throws not-found when the mandate does not exist', async () => {
    mock(db.paymentMandate.findUnique).mockResolvedValue(null as never)
    await expect(approveMandate('a1', ADMIN, 'no')).rejects.toBeInstanceOf(AdminNotFoundError)
  })

  it('refuses to approve a mandate that is not PENDING', async () => {
    mock(db.paymentMandate.findUnique).mockResolvedValue({ id: 'm1', status: 'ACTIVE', userId: 'u1' } as never)
    await expect(approveMandate('a1', ADMIN, 'm1')).rejects.toBeInstanceOf(AdminConflictError)
    expect(db.paymentMandate.update).not.toHaveBeenCalled()
  })

  it('activates a PENDING mandate and notifies the member', async () => {
    mock(db.paymentMandate.findUnique).mockResolvedValue({ id: 'm1', status: 'PENDING', userId: 'u1' } as never)
    mock(db.paymentMandate.update).mockResolvedValue({ id: 'm1', status: 'ACTIVE' } as never)

    const res = await approveMandate('a1', ADMIN, 'm1')

    expect(res.status).toBe('ACTIVE')
    expect(db.paymentMandate.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE', approvedById: 'a1' }) }),
    )
    expect(db.inboxMessage.create).toHaveBeenCalled() // member notified
  })
})

describe('rejectMandate — terminal-state guard', () => {
  it('refuses to reject an already-cancelled mandate', async () => {
    mock(db.paymentMandate.findUnique).mockResolvedValue({ id: 'm1', status: 'CANCELLED', userId: 'u1' } as never)
    await expect(rejectMandate('a1', ADMIN, 'm1')).rejects.toBeInstanceOf(AdminConflictError)
    expect(db.paymentMandate.update).not.toHaveBeenCalled()
  })

  it('cancels an active mandate and notifies the member', async () => {
    mock(db.paymentMandate.findUnique).mockResolvedValue({ id: 'm1', status: 'ACTIVE', userId: 'u1' } as never)
    mock(db.paymentMandate.update).mockResolvedValue({ id: 'm1', status: 'CANCELLED' } as never)

    const res = await rejectMandate('a1', ADMIN, 'm1')

    expect(res.status).toBe('CANCELLED')
    expect(db.inboxMessage.create).toHaveBeenCalled()
  })
})

describe('unlockMember', () => {
  it('resets the lockout and failed-attempt counter', async () => {
    mock(db.user.findUnique).mockResolvedValue({ id: 'm1', lockedUntil: new Date(), loginAttempts: 5 } as never)
    mock(db.user.update).mockResolvedValue({ id: 'm1', lockedUntil: null, loginAttempts: 0 } as never)

    await unlockMember('a1', ADMIN, 'm1')

    expect(db.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lockedUntil: null, loginAttempts: 0 } }),
    )
  })

  it('throws not-found for an unknown member', async () => {
    mock(db.user.findUnique).mockResolvedValue(null as never)
    await expect(unlockMember('a1', ADMIN, 'nope')).rejects.toBeInstanceOf(AdminNotFoundError)
  })
})
