import { db } from '@/lib/db'

export type InboxCategoryKey = 'BROADCAST' | 'SYSTEM' | 'PAYMENT' | 'GOAL'

/**
 * Which hat the recipient was wearing when the message was addressed to them.
 *
 * Separate from the category, and it has to be: a statement notice and an
 * operational alert are both SYSTEM, so the category cannot tell a member's own
 * business apart from the running of the Foundation.
 */
export type InboxAudienceKey = 'MEMBER' | 'ADMIN'

export type InboxItem = {
  id: string
  title: string
  body: string
  category: InboxCategoryKey
  audience: InboxAudienceKey
  read: boolean
  createdAt: string
}

const PAGE_SIZE = 30

/**
 * A member's in-app inbox: readable messages with read/unread state.
 *
 * `audience` narrows it to one of the two streams. Omitting it returns both,
 * which is what a caller wanting a single unread total should do — the bell in
 * the header counts everything waiting for this person, whichever hat it
 * concerns.
 *
 * The counts come back scoped to the same filter, so a tab's badge describes
 * that tab rather than the whole inbox.
 */
export async function getInbox(
  userId: string,
  opts: {
    unreadOnly?: boolean
    cursor?: string
    limit?: number
    audience?: InboxAudienceKey
  } = {},
): Promise<{ items: InboxItem[]; total: number; unreadCount: number; nextCursor: string | null }> {
  const limit = opts.limit ?? PAGE_SIZE
  const scope = { userId, ...(opts.audience && { audience: opts.audience }) }
  const where = { ...scope, ...(opts.unreadOnly && { readAt: null }) }

  const [rows, total, unreadCount] = await Promise.all([
    db.inboxMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(opts.cursor && { cursor: { id: opts.cursor }, skip: 1 }),
      select: {
        id: true, title: true, body: true, category: true,
        audience: true, readAt: true, createdAt: true,
      },
    }),
    db.inboxMessage.count({ where: scope }),
    db.inboxMessage.count({ where: { ...scope, readAt: null } }),
  ])

  const hasNext = rows.length > limit
  const items = hasNext ? rows.slice(0, limit) : rows

  return {
    items: items.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      category: r.category as InboxCategoryKey,
      audience: r.audience as InboxAudienceKey,
      read: r.readAt !== null,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    unreadCount,
    nextCursor: hasNext ? (items[items.length - 1]?.id ?? null) : null,
  }
}

/**
 * Everything unread for this person, both streams together.
 *
 * Deliberately unscoped: this is the number on the bell, and a founder with an
 * unread operational alert has something waiting whether or not they are
 * thinking about the Foundation as a member at that moment.
 */
export async function getUnreadInboxCount(userId: string): Promise<number> {
  return db.inboxMessage.count({ where: { userId, readAt: null } })
}

/**
 * Mark one of the member's own messages read.
 *
 * Returns whether a message of theirs was actually found. It used to return
 * nothing, and the route reported `{ read: true }` either way — so a request
 * for a message that did not exist, or belonged to somebody else, was answered
 * "done". Nothing was ever written to another member's row (the filter has
 * always been scoped by `userId`), but an endpoint that claims to have acted
 * when it has not is a bad thing to build a UI on: the client marks the item
 * read, and it comes back unread on the next load.
 *
 * Already-read messages return true and are left alone, so a repeated call is
 * idempotent rather than re-stamping the time it was first seen.
 */
export async function markInboxRead(userId: string, id: string): Promise<boolean> {
  const existing = await db.inboxMessage.findFirst({
    where: { id, userId },
    select: { id: true, readAt: true },
  })
  if (!existing) return false
  if (existing.readAt) return true

  await db.inboxMessage.update({ where: { id: existing.id }, data: { readAt: new Date() } })
  return true
}

export async function markAllInboxRead(userId: string): Promise<number> {
  const res = await db.inboxMessage.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })
  return res.count
}

/** Delete one of the member's own messages. False when they had no such message. */
export async function deleteInboxMessage(userId: string, id: string): Promise<boolean> {
  const res = await db.inboxMessage.deleteMany({ where: { id, userId } })
  return res.count > 0
}

/**
 * Fan-out helper: writes one inbox message per recipient. Used by admin
 * broadcasts and, later, key system events.
 */
export async function createInboxMessages(
  userIds: string[],
  msg: {
    title: string
    body: string
    category?: InboxCategoryKey
    /** Defaults to MEMBER — see the enum note in the schema. */
    audience?: InboxAudienceKey
    createdById?: string
  },
): Promise<number> {
  if (userIds.length === 0) return 0
  const res = await db.inboxMessage.createMany({
    data: userIds.map((userId) => ({
      userId,
      title: msg.title,
      body: msg.body,
      category: msg.category ?? 'BROADCAST',
      audience: msg.audience ?? 'MEMBER',
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
    // The single place ADMIN audience is set. Everything else writes to a
    // person as a member, so the default handles it — and a new caller that
    // forgets to think about this lands a message where a member would look,
    // which is the safe direction to be wrong in.
    audience: 'ADMIN',
  })
}
