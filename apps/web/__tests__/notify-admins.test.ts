import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: {
    user: { findMany: vi.fn() },
    inboxMessage: { createMany: vi.fn() },
  },
}))

import { db } from '@/lib/db'
import { notifyAdmins } from '@/services/inbox.service'

const mock = <T extends (...a: never[]) => unknown>(fn: unknown) => fn as MockedFunction<T>

beforeEach(() => {
  vi.clearAllMocks()
  mock(db.inboxMessage.createMany).mockResolvedValue({ count: 0 } as never)
})

describe('notifyAdmins — one way to reach the people who run the platform', () => {
  it('writes to every active admin', async () => {
    mock(db.user.findMany).mockResolvedValue([{ id: 'a1' }, { id: 'a2' }] as never)
    mock(db.inboxMessage.createMany).mockResolvedValue({ count: 2 } as never)

    expect(await notifyAdmins({ title: 'Alert', body: 'Something moved' })).toBe(2)

    const [{ data }] = mock(db.inboxMessage.createMany).mock.calls[0] as unknown as [
      { data: Array<{ userId: string; title: string }> },
    ]
    expect(data.map((d) => d.userId)).toEqual(['a1', 'a2'])
  })

  it('leaves out an admin who has been suspended', async () => {
    // The anomaly watch used to select on the ADMIN role alone, so an account
    // that had been suspended kept receiving the group's financial alerts.
    await notifyAdmins({ title: 'Alert', body: 'x' })

    const [arg] = mock(db.user.findMany).mock.calls[0] as unknown as [
      { where: { status: string; roles: unknown } },
    ]
    expect(arg.where.status).toBe('ACTIVE')
    expect(arg.where.roles).toEqual({ some: { role: { name: 'ADMIN' } } })
  })

  it('reports nobody reached when there is no active admin, rather than pretending', async () => {
    mock(db.user.findMany).mockResolvedValue([] as never)

    expect(await notifyAdmins({ title: 'Alert', body: 'x' })).toBe(0)
    expect(db.inboxMessage.createMany).not.toHaveBeenCalled()
  })

  it('files these as system messages, not broadcasts', async () => {
    mock(db.user.findMany).mockResolvedValue([{ id: 'a1' }] as never)
    mock(db.inboxMessage.createMany).mockResolvedValue({ count: 1 } as never)

    await notifyAdmins({ title: 'Alert', body: 'x' })

    const [{ data }] = mock(db.inboxMessage.createMany).mock.calls[0] as unknown as [
      { data: Array<{ category: string }> },
    ]
    expect(data[0]!.category).toBe('SYSTEM')
  })

  it('carries the message through unchanged', async () => {
    mock(db.user.findMany).mockResolvedValue([{ id: 'a1' }] as never)
    mock(db.inboxMessage.createMany).mockResolvedValue({ count: 1 } as never)

    await notifyAdmins({ title: '2 brothers could use a check-in', body: '• Ku — a debit was declined recently' })

    const [{ data }] = mock(db.inboxMessage.createMany).mock.calls[0] as unknown as [
      { data: Array<{ title: string; body: string }> },
    ]
    expect(data[0]).toMatchObject({
      title: '2 brothers could use a check-in',
      body: '• Ku — a debit was declined recently',
    })
  })
})
