import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

// ─── Community repository ───────────────────────────────────────────────────
// Thin wrapper around db.communityMessage.* — zero business logic.

const authorSelect = {
  select: {
    id: true,
    firstName: true,
    lastName: true,
    badgeScore: { select: { currentBadge: true } },
  },
} satisfies { select: Prisma.UserSelect }

export const communityRepo = {
  /** Paginated top-level messages (pinned first, then newest), with replies and author badge. */
  findMessages(page: number, limit: number) {
    return db.communityMessage.findMany({
      where: { isDeleted: false, replyToId: null },
      include: {
        user: authorSelect,
        replies: {
          where: { isDeleted: false },
          include: { user: authorSelect },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
    })
  },

  /** Total count of top-level, non-deleted messages (for pagination). */
  countTopLevel() {
    return db.communityMessage.count({ where: { isDeleted: false, replyToId: null } })
  },

  /** Find a single message by ID (for permission/ownership checks). */
  findById(id: string) {
    return db.communityMessage.findUnique({ where: { id } })
  },

  /** Create a new message or reply. */
  create(data: Prisma.CommunityMessageUncheckedCreateInput) {
    return db.communityMessage.create({
      data,
      include: { user: authorSelect },
    })
  },

  /** Edit a message's content (own, within the edit window). */
  updateContent(id: string, content: string) {
    return db.communityMessage.update({
      where: { id },
      data: { content, editedAt: new Date() },
      include: { user: authorSelect },
    })
  },

  /** Soft-delete a message (own within edit window, or admin at any time). */
  softDelete(id: string, deletedById: string) {
    return db.communityMessage.update({
      where: { id },
      data: { isDeleted: true, deletedById, deletedAt: new Date() },
    })
  },

  /** Pin or unpin a message (admin only). */
  setPinned(id: string, isPinned: boolean) {
    return db.communityMessage.update({ where: { id }, data: { isPinned } })
  },

  /** Count of non-deleted messages a user has posted within a date range (for the daily limit). */
  countByUserInRange(userId: string, from: Date, to: Date) {
    return db.communityMessage.count({
      where: { userId, createdAt: { gte: from, lte: to }, isDeleted: false },
    })
  },
}
