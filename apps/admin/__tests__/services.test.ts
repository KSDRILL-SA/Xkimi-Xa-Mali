import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

const apiMocks = vi.hoisted(() => ({ internalAdminPost: vi.fn() }))
vi.mock('@/lib/api', () => ({ internalAdminPost: apiMocks.internalAdminPost }))

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    paymentMandate: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
    contribution: { findMany: vi.fn(), aggregate: vi.fn() },
    inboxMessage: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  },
  Prisma: {},
}))
vi.mock('@/lib/signature-storage', () => ({ storeSignaturePng: vi.fn() }))
vi.mock('@/lib/env', () => ({
  env: { UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined },
}))

import { db } from '@/lib/db'
import {
  unlockMember,
  approveMandate,
  rejectMandate,
  AdminForbiddenError,
  AdminNotFoundError,
  AdminConflictError,
  getDashboardStats,
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
    await expect(rejectMandate('a1', ADMIN, 'm1', undefined, 'Duplicate of an earlier request'))
      .rejects.toBeInstanceOf(AdminConflictError)
    expect(db.paymentMandate.update).not.toHaveBeenCalled()
  })

  it('stops a live mandate — leadership needs to be able to', async () => {
    // Kept deliberately. An account closes, somebody leaves, a debit order has
    // to stop. What changed is not whether this is allowed but what the member
    // is told: "not approved, check your bank details" was false for a mandate
    // that had been approved and then stopped.
    mock(db.paymentMandate.findUnique).mockResolvedValue({ id: 'm1', status: 'ACTIVE', userId: 'u1' } as never)
    apiMocks.internalAdminPost.mockResolvedValue({ ok: true, status: 200, data: null })

    const res = await rejectMandate('a1', ADMIN, 'm1', undefined, 'Account closed at the bank')

    expect(res.status).toBe('CANCELLED')
  })

  it('hands the work to the app that owns the gateway', async () => {
    // This app cannot reach Netcash at all. Writing CANCELLED locally and
    // stopping left the bank still holding permission to debit the member.
    mock(db.paymentMandate.findUnique).mockResolvedValue({ id: 'm1', status: 'PENDING', userId: 'u1' } as never)
    apiMocks.internalAdminPost.mockResolvedValue({ ok: true, status: 200, data: null })

    await rejectMandate('a1', ADMIN, 'm1', '41.0.0.9', 'Account name does not match')

    expect(apiMocks.internalAdminPost).toHaveBeenCalledWith(
      '/api/v1/admin/mandates/m1/reject',
      { reason: 'Account name does not match' },
      { adminUserId: 'a1', adminIp: '41.0.0.9' },
    )
    expect(db.paymentMandate.update).not.toHaveBeenCalled()
  })

  it('refuses without a reason', async () => {
    mock(db.paymentMandate.findUnique).mockResolvedValue({ id: 'm1', status: 'PENDING', userId: 'u1' } as never)

    await expect(rejectMandate('a1', ADMIN, 'm1', undefined, 'nope'))
      .rejects.toThrow(/at least 10 characters/i)
    expect(apiMocks.internalAdminPost).not.toHaveBeenCalled()
  })

  it('surfaces a failure from the other side rather than claiming success', async () => {
    mock(db.paymentMandate.findUnique).mockResolvedValue({ id: 'm1', status: 'PENDING', userId: 'u1' } as never)
    apiMocks.internalAdminPost.mockResolvedValue({
      ok: false, status: 409, data: null, error: { message: 'Mandate is already cancelled' },
    })

    await expect(rejectMandate('a1', ADMIN, 'm1', undefined, 'Account name does not match'))
      .rejects.toThrow(/already cancelled/i)
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

describe('the pool total on the dashboard', () => {
  it('counts money paid against a part-settled contribution', async () => {
    // It filtered on `status: 'PAID'`, so a member who had paid R250 of R400
    // contributed nothing as far as the headline figure was concerned — their
    // contribution is PARTIAL. The label says "all-time collected", and the
    // member app's fund derivation has always summed `amountPaid` unfiltered,
    // so the two apps disagreed about how much money exists.
    mock(db.user.count).mockResolvedValue(3 as never)
    mock(db.contribution.findMany).mockResolvedValue([] as never)
    mock(db.contribution.aggregate).mockResolvedValue({ _sum: { amountPaid: 4650 } } as never)
    mock(db.paymentMandate.count).mockResolvedValue(1 as never)

    const stats = await getDashboardStats(ADMIN)

    expect(stats.poolTotal).toBe(4650)
    // No status filter: the sum is of everything received.
    expect(db.contribution.aggregate).toHaveBeenCalledWith({ _sum: { amountPaid: true } })
  })
})
