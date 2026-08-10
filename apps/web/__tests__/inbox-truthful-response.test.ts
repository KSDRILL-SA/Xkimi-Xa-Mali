import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The inbox item endpoint answered `{ read: true }` whatever happened.
 *
 * Nothing was ever written to another member's row — the filter has always been
 * scoped by `userId`, and probing another member's message id against the live
 * app left their `readAt` null. The defect is the answer, not the write: a
 * request that changed nothing was told it had succeeded.
 *
 * That is a bad foundation for a UI. The client marks the message read, the
 * badge count drops, and the next load brings it back — with no error anywhere
 * to explain why.
 */

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
}))

vi.mock('@/lib/env', () => ({ env: {} }))
vi.mock('@xxm/observability', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/db', () => ({
  db: {
    inboxMessage: {
      findFirst: mocks.findFirst,
      update: mocks.update,
      deleteMany: mocks.deleteMany,
      updateMany: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      createMany: vi.fn(),
    },
  },
}))

import { markInboxRead, deleteInboxMessage } from '@/services/inbox.service'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.update.mockResolvedValue({})
})

describe('marking a message read', () => {
  it('reports true and stamps the time when the message is theirs and unread', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'm1', readAt: null })

    expect(await markInboxRead('u1', 'm1')).toBe(true)
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: 'm1' },
      data: { readAt: expect.any(Date) },
    })
  })

  it('scopes the lookup to the member', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'm1', readAt: null })

    await markInboxRead('u1', 'm1')

    expect(mocks.findFirst.mock.calls[0]![0]).toMatchObject({ where: { id: 'm1', userId: 'u1' } })
  })

  it('reports false for a message that is not theirs', async () => {
    // The case that started this: another member's id answered "done".
    mocks.findFirst.mockResolvedValue(null)

    expect(await markInboxRead('u1', 'someone-elses')).toBe(false)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('is idempotent on a message already read', async () => {
    // True, because the member's message is read — but the original time it was
    // seen is not overwritten by asking again.
    mocks.findFirst.mockResolvedValue({ id: 'm1', readAt: new Date('2026-08-01') })

    expect(await markInboxRead('u1', 'm1')).toBe(true)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})

describe('deleting a message', () => {
  it('reports true when one of theirs was removed', async () => {
    mocks.deleteMany.mockResolvedValue({ count: 1 })

    expect(await deleteInboxMessage('u1', 'm1')).toBe(true)
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { id: 'm1', userId: 'u1' } })
  })

  it('reports false when they had no such message', async () => {
    mocks.deleteMany.mockResolvedValue({ count: 0 })

    expect(await deleteInboxMessage('u1', 'someone-elses')).toBe(false)
  })
})
