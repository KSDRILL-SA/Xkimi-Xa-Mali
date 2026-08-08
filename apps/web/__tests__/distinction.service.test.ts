import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FOUNDER_COUNT } from '@xxm/utils'

/**
 * The Founder badge: conferred, permanent, and deliberately kept away from the
 * tier ladder.
 *
 * `BadgeScore.currentBadge` is *derived* — recalculated from contribution
 * behaviour on every status change. A founder mark written there would be
 * overwritten the next time that founder paid a contribution. Everything here
 * exists to keep the two apart; see docs/founder-badge-plan.md.
 */

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  findUniqueDistinction: vi.fn(),
  findManyDistinction: vi.fn(),
  deleteDistinction: vi.fn(),
  writeAuditLog: vi.fn(),
  queueNotification: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: {} }))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: mocks.findUser },
    memberDistinction: {
      count: mocks.count,
      create: mocks.create,
      findUnique: mocks.findUniqueDistinction,
      findMany: mocks.findManyDistinction,
      delete: mocks.deleteDistinction,
    },
  },
}))
vi.mock('@/services/audit.service', () => ({ writeAuditLog: mocks.writeAuditLog }))
vi.mock('@/services/notification.service', () => ({ queueNotification: mocks.queueNotification }))
vi.mock('@xxm/observability', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

import {
  grantDistinction,
  removeDistinction,
  getFounderIds,
  isFounder,
  withFounderFlag,
} from '@/services/distinction.service'
import { ConflictError, NotFoundError } from '@/lib/errors'

const ADMIN = 'admin-1'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.findUser.mockResolvedValue({ id: 'user-1', firstName: 'Kurhula' })
  mocks.count.mockResolvedValue(0)
  mocks.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ ...data, grantedAt: new Date('2026-08-08T00:00:00Z') }),
  )
  mocks.findManyDistinction.mockResolvedValue([])
  mocks.writeAuditLog.mockResolvedValue(undefined)
  mocks.queueNotification.mockResolvedValue(undefined)
})

describe('granting the badge', () => {
  it('records who granted it, and tells the member', async () => {
    await grantDistinction({ userId: 'user-1', kind: 'FOUNDER', grantedById: ADMIN })

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', kind: 'FOUNDER', grantedById: ADMIN }),
      }),
    )
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DISTINCTION_GRANTED', entityId: 'user-1' }),
    )
    // A mark appearing on an account with no word about it reads as a bug.
    expect(mocks.queueNotification).toHaveBeenCalledWith(
      expect.objectContaining({ templateSlug: 'founder-badge-granted', payload: { firstName: 'Kurhula' } }),
    )
  })

  it('marks a self-grant as one rather than leaving it to be inferred', async () => {
    // There is one admin and he is himself a founder, so somebody has to grant
    // the first badge and there is nobody else to do it. Expected — and expected
    // things still belong on the record.
    await grantDistinction({ userId: ADMIN, kind: 'FOUNDER', grantedById: ADMIN })

    const [audit] = mocks.writeAuditLog.mock.calls[0]
    expect(audit.payload).toMatchObject({ selfGranted: true })
  })

  it('does not mark a grant to somebody else as a self-grant', async () => {
    await grantDistinction({ userId: 'user-1', kind: 'FOUNDER', grantedById: ADMIN })
    expect(mocks.writeAuditLog.mock.calls[0][0].payload).toMatchObject({ selfGranted: false })
  })

  it('refuses a fifth founder', async () => {
    // The same reasoning as the fifty-member cap: a number that is a design
    // decision should be enforced rather than remembered.
    mocks.count.mockResolvedValue(FOUNDER_COUNT)

    await expect(
      grantDistinction({ userId: 'user-5', kind: 'FOUNDER', grantedById: ADMIN }),
    ).rejects.toBeInstanceOf(ConflictError)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('still grants the fourth', async () => {
    mocks.count.mockResolvedValue(FOUNDER_COUNT - 1)
    await expect(
      grantDistinction({ userId: 'user-4', kind: 'FOUNDER', grantedById: ADMIN }),
    ).resolves.toBeTruthy()
  })

  it('reports a double grant as a conflict, not a Prisma error', async () => {
    const { Prisma } = await import('@prisma/client')
    mocks.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '6' }),
    )

    await expect(
      grantDistinction({ userId: 'user-1', kind: 'FOUNDER', grantedById: ADMIN }),
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('refuses to grant to a member who does not exist', async () => {
    mocks.findUser.mockResolvedValue(null)
    await expect(
      grantDistinction({ userId: 'ghost', kind: 'FOUNDER', grantedById: ADMIN }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('is not undone by a notification that cannot be queued', async () => {
    // The grant is already written and audited. A mail provider being down is
    // not a reason to lose it.
    mocks.queueNotification.mockRejectedValue(new Error('resend down'))
    await expect(
      grantDistinction({ userId: 'user-1', kind: 'FOUNDER', grantedById: ADMIN }),
    ).resolves.toBeTruthy()
  })
})

describe('removing the badge', () => {
  beforeEach(() => {
    mocks.findUniqueDistinction.mockResolvedValue({
      grantedAt: new Date('2026-08-01T00:00:00Z'),
      grantedById: ADMIN,
    })
    mocks.deleteDistinction.mockResolvedValue(undefined)
  })

  it('keeps the grant details, because the row holding them is now gone', async () => {
    await removeDistinction({
      userId: 'user-1',
      kind: 'FOUNDER',
      removedById: ADMIN,
      reason: 'granted to the wrong account',
    })

    expect(mocks.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DISTINCTION_REMOVED',
        payload: expect.objectContaining({
          reason: 'granted to the wrong account',
          originallyGrantedById: ADMIN,
          originallyGrantedAt: '2026-08-01T00:00:00.000Z',
        }),
      }),
    )
  })

  it('refuses when the member does not hold it', async () => {
    mocks.findUniqueDistinction.mockResolvedValue(null)
    await expect(
      removeDistinction({ userId: 'user-1', kind: 'FOUNDER', removedById: ADMIN, reason: 'x'.repeat(10) }),
    ).rejects.toBeInstanceOf(NotFoundError)
    expect(mocks.deleteDistinction).not.toHaveBeenCalled()
  })
})

describe('reading who holds it', () => {
  it('answers for a whole list in one query, not one per member', async () => {
    mocks.findManyDistinction.mockResolvedValue([{ userId: 'user-1' }, { userId: 'user-3' }])

    const rows = await withFounderFlag([
      { userId: 'user-1', name: 'A' },
      { userId: 'user-2', name: 'B' },
      { userId: 'user-3', name: 'C' },
    ])

    expect(mocks.findManyDistinction).toHaveBeenCalledOnce()
    expect(rows.map((r) => r.isFounder)).toEqual([true, false, true])
    // The original fields survive untouched.
    expect(rows[0]).toMatchObject({ userId: 'user-1', name: 'A' })
  })

  it('does not query at all for an empty list', async () => {
    await withFounderFlag([])
    expect(mocks.findManyDistinction).not.toHaveBeenCalled()
  })

  it('reports a member who holds nothing as not a founder', async () => {
    mocks.findUniqueDistinction.mockResolvedValue(null)
    expect(await isFounder('user-9')).toBe(false)
  })

  it('reports a holder as a founder', async () => {
    mocks.findUniqueDistinction.mockResolvedValue({ userId: 'user-1' })
    expect(await isFounder('user-1')).toBe(true)
  })

  it('returns the ids as a set', async () => {
    mocks.findManyDistinction.mockResolvedValue([{ userId: 'a' }, { userId: 'b' }])
    const ids = await getFounderIds()
    expect(ids.has('a')).toBe(true)
    expect(ids.has('z')).toBe(false)
  })
})
