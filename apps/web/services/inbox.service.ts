import { db } from '@/lib/db'

export type InboxCategoryKey = 'BROADCAST' | 'SYSTEM' | 'PAYMENT' | 'GOAL'

export type InboxItem = {
  id: string
  title: string
  body: string
  category: InboxCategoryKey
  read: boolean
  createdAt: string
}

const PAGE_SIZE = 30

/** A member's in-app inbox: readable messages with read/unread state. */
export async function getInbox(
  userId: string,
  opts: { unreadOnly?: boolean; cursor?: string; limit?: number } = {},
): Promise<{ items: InboxItem[]; total: number; unreadCount: number; nextCursor: string | null }> {
  const limit = opts.limit ?? PAGE_SIZE
  const where = { userId, ...(opts.unreadOnly && { readAt: null }) }

  const [rows, total, unreadCount] = await Promise.all([
    db.inboxMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(opts.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
      select: { id: true, title: true, body: true, category: true, readAt: true, createdAt: true },
    }),
    db.inboxMessage.count({ where: { userId } }),
    db.inboxMessage.count({ where: { userId, readAt: null } }),
  ])

  const hasNext = rows.length > limit
  const items = hasNext ? rows.slice(0, limit) : rows

  return {
    items: items.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      category: r.category as InboxCategoryKey,
      read: r.readAt !== null,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    unreadCount,
    nextCursor: hasNext ? (items[items.length - 1]?.id ?? null) : null,
  }
}

export async function getUnreadInboxCount(userId: string): Promise<number> {
  return db.inboxMessage.count({ where: { userId, readAt: null } })
}

export async function markInboxRead(userId: string, id: string): Promise<void> {
  await db.inboxMessage.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } })
}

export async function markAllInboxRead(userId: string): Promise<number> {
  const res = await db.inboxMessage.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })
  return res.count
}

export async function deleteInboxMessage(userId: string, id: string): Promise<void> {
  await db.inboxMessage.deleteMany({ where: { id, userId } })
}

/**
 * Fan-out helper: writes one inbox message per recipient. Used by admin
 * broadcasts and, later, key system events.
 */
export async function createInboxMessages(
  userIds: string[],
  msg: { title: string; body: string; category?: InboxCategoryKey; createdById?: string },
): Promise<number> {
  if (userIds.length === 0) return 0
  const res = await db.inboxMessage.createMany({
    data: userIds.map((userId) => ({
      userId,
      title: msg.title,
      body: msg.body,
      category: msg.category ?? 'BROADCAST',
      createdById: msg.createdById ?? null,
    })),
  })
  return res.count
}

/**
 * Reach the people who run the platform.
 *
 * One definition of "who is an admin, and are they still someone we should be
 * telling things to". This was written out separately in each job that needed
 * it, and the copies had already drifted: the anomaly watch alerted every
 * account holding the ADMIN role, including any that had since been suspended.
 * A suspended admin should not be receiving the group's financial alerts.
 *
 * Returns how many people were reached, which is zero when there are no active
 * admins — a state worth knowing about rather than a silent no-op.
 */
export async function notifyAdmins(msg: {
  title: string
  body: string
  category?: InboxCategoryKey
}): Promise<number> {
  const admins = await db.user.findMany({
    where: { status: 'ACTIVE', roles: { some: { role: { name: 'ADMIN' } } } },
    select: { id: true },
  })

  return createInboxMessages(admins.map((a) => a.id), {
    title: msg.title,
    body: msg.body,
    category: msg.category ?? 'SYSTEM',
  })
}
