import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Two streams in one inbox, for one person wearing two hats.
 *
 * Everything operational has always gone only to ADMIN-role users, so no member
 * was ever seeing it — that part was already right. What was wrong is the other
 * side: the founder holds both roles, and one merged list put a failed debit
 * run next to their own payment receipt. The operational half is what a busy
 * person scrolls past on the way to what actually concerns them.
 *
 * The category could not make the split. A statement notice and an operational
 * alert are both SYSTEM, so audience is a separate axis — and these guard the
 * two things that make it worth having: that only `notifyAdmins` writes ADMIN,
 * and that everything else lands where a member would look.
 */

const mocks = vi.hoisted(() => ({
  createMany: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  findUsers: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    inboxMessage: {
      createMany: mocks.createMany,
      findMany: mocks.findMany,
      count: mocks.count,
    },
    user: { findMany: mocks.findUsers },
  },
}))

import { createInboxMessages, notifyAdmins, getInbox } from '@/services/inbox.service'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createMany.mockResolvedValue({ count: 1 })
  mocks.findMany.mockResolvedValue([])
  mocks.count.mockResolvedValue(0)
  mocks.findUsers.mockResolvedValue([{ id: 'admin-1' }])
})

describe('what audience a message is written with', () => {
  it('defaults to MEMBER when a caller does not say', async () => {
    // The safe direction to be wrong in. A new caller that forgets to think
    // about this lands a message where a member would look, rather than hiding
    // something from them in a tab they may never open.
    await createInboxMessages(['member-1'], { title: 'T', body: 'B' })

    expect(mocks.createMany.mock.calls[0][0].data[0].audience).toBe('MEMBER')
  })

  it('marks what notifyAdmins sends as ADMIN', async () => {
    // The single place ADMIN is set, and every operational alert goes through
    // it — raiseAlert, the debit-run warnings, mandates awaiting review.
    await notifyAdmins({ title: '🔴 Debit run failed', body: 'B' })

    expect(mocks.createMany.mock.calls[0][0].data[0].audience).toBe('ADMIN')
  })

  it('still reaches only active admins, not every member', async () => {
    // The boundary that was already correct and must stay so. A tab is a
    // convenience; this is the actual protection.
    await notifyAdmins({ title: 'T', body: 'B' })

    expect(mocks.findUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'ACTIVE', roles: { some: { role: { name: 'ADMIN' } } } },
      }),
    )
  })

  it('keeps a member payment notice on the member side', async () => {
    // What a member is entitled to see about their own money must never end up
    // filed under the running of the Foundation.
    await createInboxMessages(['member-1'], {
      title: 'R500.00 recorded against August 2026',
      body: 'B',
      category: 'PAYMENT',
    })

    expect(mocks.createMany.mock.calls[0][0].data[0].audience).toBe('MEMBER')
  })
})

describe('reading one stream at a time', () => {
  it('scopes the query to the audience asked for', async () => {
    await getInbox('user-1', { audience: 'ADMIN' })

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', audience: 'ADMIN' } }),
    )
  })

  it('counts unread within that stream, not across both', async () => {
    // A tab's badge has to describe that tab. An admin badge showing the
    // member total would send somebody to the wrong list looking for it.
    await getInbox('user-1', { audience: 'MEMBER' })

    for (const call of mocks.count.mock.calls) {
      expect(call[0].where).toMatchObject({ userId: 'user-1', audience: 'MEMBER' })
    }
  })

  it('returns both streams when no audience is named', async () => {
    // What the bell in the header wants: a founder with an unread operational
    // alert has something waiting, whichever hat it concerns.
    await getInbox('user-1')

    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    )
  })

  it('never widens past the one member, whatever else is asked', async () => {
    // The clause that makes an inbox an inbox. Everything else here is
    // presentation; this is the part that must not be simplified away.
    await getInbox('user-1', { audience: 'ADMIN', unreadOnly: true })

    const { where } = mocks.findMany.mock.calls[0][0]
    expect(where.userId).toBe('user-1')
  })
})
