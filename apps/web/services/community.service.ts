import type { BadgeTier } from '@prisma/client'
import { communityRepo } from '@/repositories/community.repository'
import { cache } from '@/lib/cache'
import { todaySAST } from '@/lib/date'
import { isAdmin, assertAdmin } from '@/lib/authorization'
import { writeAuditLog } from './audit.service'
import {
  MessageNotFoundError,
  MessageLimitError,
  MessageEditWindowError,
  MessageDepthError,
  ForbiddenError,
  ValidationError,
} from '@/lib/errors'

const DAILY_MESSAGE_LIMIT = 10
const EDIT_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const MAX_CONTENT_LENGTH = 500

// ─── Daily limit (Redis-backed, soft-fails open if Redis is unavailable) ──────

function dailyLimitKey(userId: string): string {
  return `xxm:community:daily:${userId}:${todaySAST()}`
}

function secondsUntilMidnightSAST(): number {
  const now = new Date()
  const sastNow = new Date(now.getTime() + 2 * 60 * 60 * 1000)
  const nextMidnightSAST = Date.UTC(
    sastNow.getUTCFullYear(),
    sastNow.getUTCMonth(),
    sastNow.getUTCDate() + 1,
  )
  const nextMidnightUTC = nextMidnightSAST - 2 * 60 * 60 * 1000
  return Math.max(1, Math.floor((nextMidnightUTC - now.getTime()) / 1000))
}

async function checkAndIncrementDailyLimit(userId: string): Promise<void> {
  const key = dailyLimitKey(userId)
  const count = (await cache.get<number>(key)) ?? 0

  if (count >= DAILY_MESSAGE_LIMIT) {
    throw new MessageLimitError()
  }

  await cache.set(key, count + 1, secondsUntilMidnightSAST())
}

/** Today's message count + limit, for the "X/10 messages today" indicator. */
export async function getDailyLimitStatus(userId: string) {
  const count = (await cache.get<number>(dailyLimitKey(userId))) ?? 0
  return { used: Math.min(count, DAILY_MESSAGE_LIMIT), limit: DAILY_MESSAGE_LIMIT }
}

// ─── Serialization ────────────────────────────────────────────────────────────

type AuthorPayload = {
  id: string
  firstName: string
  lastName: string
  badgeScore: { currentBadge: BadgeTier } | null
}

type MessagePayload = {
  id: string
  content: string
  isPinned: boolean
  editableUntil: Date
  editedAt: Date | null
  createdAt: Date
  user: AuthorPayload
  replies?: MessagePayload[]
}

type SerializedMessage = {
  id: string
  content: string
  isPinned: boolean
  editableUntil: string
  editedAt: string | null
  createdAt: string
  author: {
    id: string
    firstName: string
    lastName: string
    badge: BadgeTier
  }
  replies: SerializedMessage[]
}

function serializeMessage(message: MessagePayload): SerializedMessage {
  return {
    id: message.id,
    content: message.content,
    isPinned: message.isPinned,
    editableUntil: message.editableUntil.toISOString(),
    editedAt: message.editedAt ? message.editedAt.toISOString() : null,
    createdAt: message.createdAt.toISOString(),
    author: {
      id: message.user.id,
      firstName: message.user.firstName,
      lastName: message.user.lastName,
      badge: message.user.badgeScore?.currentBadge ?? 'AMATEUR',
    },
    replies: message.replies?.map(serializeMessage) ?? [],
  }
}

// ─── Queries ───────────────────────────────────────────────────────────────

/** Paginated top-level messages (pinned first), with replies, author badges, and the viewer's daily limit. */
export async function getMessages(page = 1, limit = 20, userId?: string) {
  const [items, total, dailyLimit] = await Promise.all([
    communityRepo.findMessages(page, limit),
    communityRepo.countTopLevel(),
    userId ? getDailyLimitStatus(userId) : Promise.resolve(null),
  ])

  return {
    items: items.map((item) => serializeMessage(item as unknown as MessagePayload)),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    dailyLimit,
  }
}

// ─── Mutations ─────────────────────────────────────────────────────────────

/** Post a new message or a reply (max 2 levels deep), subject to the daily limit. */
export async function postMessage(userId: string, content: string, replyToId?: string) {
  const trimmed = content.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_CONTENT_LENGTH) {
    throw new ValidationError(`Message must be between 1 and ${MAX_CONTENT_LENGTH} characters`)
  }

  if (replyToId) {
    const parent = await communityRepo.findById(replyToId)
    if (!parent || parent.isDeleted) throw new MessageNotFoundError()
    if (parent.replyToId !== null) throw new MessageDepthError()
  }

  await checkAndIncrementDailyLimit(userId)

  const now = new Date()
  const message = await communityRepo.create({
    userId,
    content: trimmed,
    replyToId: replyToId ?? null,
    editableUntil: new Date(now.getTime() + EDIT_WINDOW_MS),
  })

  return serializeMessage(message as unknown as MessagePayload)
}

/** Edit a message's content — own message, within the 5-minute edit window. */
export async function editMessage(
  userId: string,
  messageId: string,
  content: string,
) {
  const trimmed = content.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_CONTENT_LENGTH) {
    throw new ValidationError(`Message must be between 1 and ${MAX_CONTENT_LENGTH} characters`)
  }

  const message = await communityRepo.findById(messageId)
  if (!message || message.isDeleted) throw new MessageNotFoundError()

  const isOwner = message.userId === userId

  // Only the author may edit, and only within the edit window. Admins can pin /
  // delete but must not silently rewrite another member's words.
  if (!isOwner) throw new ForbiddenError('You can only edit your own messages')
  if (new Date() > message.editableUntil) throw new MessageEditWindowError()

  const updated = await communityRepo.updateContent(messageId, trimmed)

  await writeAuditLog({
    userId,
    action: 'COMMUNITY_MESSAGE_EDITED',
    entity: 'CommunityMessage',
    entityId: messageId,
    payload: {},
  })

  return serializeMessage(updated as unknown as MessagePayload)
}

/** Soft-delete a message — the author can delete their own message at any time,
 *  and an admin can delete any message. */
export async function deleteMessage(userId: string, messageId: string, roles: string[]) {
  const message = await communityRepo.findById(messageId)
  if (!message || message.isDeleted) throw new MessageNotFoundError()

  const isOwner = message.userId === userId
  const admin = isAdmin(roles)

  if (!admin && !isOwner) throw new ForbiddenError('You can only delete your own messages')

  await communityRepo.softDelete(messageId, userId)

  await writeAuditLog({
    userId,
    action: 'COMMUNITY_MESSAGE_DELETED',
    entity: 'CommunityMessage',
    entityId: messageId,
    payload: { ownMessage: isOwner },
  })
}

/** Pin or unpin a message (admin only). */
export async function pinMessage(
  messageId: string,
  isPinned: boolean,
  adminId: string,
  roles: string[],
) {
  assertAdmin(roles)

  const message = await communityRepo.findById(messageId)
  if (!message || message.isDeleted) throw new MessageNotFoundError()

  const updated = await communityRepo.setPinned(messageId, isPinned)

  await writeAuditLog({
    userId: adminId,
    action: isPinned ? 'COMMUNITY_MESSAGE_PINNED' : 'COMMUNITY_MESSAGE_UNPINNED',
    entity: 'CommunityMessage',
    entityId: messageId,
    payload: {},
  })

  return { id: updated.id, isPinned: updated.isPinned }
}
