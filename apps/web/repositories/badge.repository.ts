import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import type { TxClient } from './contribution.repository'

// ─── Badge repository ───────────────────────────────────────────────────────
// Thin wrapper around db.badgeScore.* / db.badgeHistory.* — zero business logic.

export const badgeRepo = {
  /** Find a member's badge score record. */
  findByUser(userId: string) {
    return db.badgeScore.findUnique({ where: { userId } })
  },

  /** Create or update a member's badge score (used by recalculation job). */
  upsert(
    userId: string,
    data: Omit<Prisma.BadgeScoreUncheckedCreateInput, 'userId'>,
    tx: TxClient = db,
  ) {
    return tx.badgeScore.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    })
  },

  /** All members with badge tier only — for the community board (no scores). */
  findAllForCommunity() {
    return db.badgeScore.findMany({
      select: {
        userId: true,
        currentBadge: true,
        user: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    })
  },

  /** All members with full scores + progress — admin only. */
  findAllWithScores(opts: {
    where?: Prisma.BadgeScoreWhereInput
    orderBy?: Prisma.BadgeScoreOrderByWithRelationInput
    skip?: number
    take?: number
  } = {}) {
    return db.badgeScore.findMany({
      where: opts.where,
      orderBy: opts.orderBy,
      skip: opts.skip,
      take: opts.take,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    })
  },

  /** Count badge scores matching a filter (for admin pagination). */
  count(where: Prisma.BadgeScoreWhereInput = {}) {
    return db.badgeScore.count({ where })
  },

  /** Append a tier-change entry to badge history. */
  createHistoryEntry(data: Prisma.BadgeHistoryUncheckedCreateInput, tx: TxClient = db) {
    return tx.badgeHistory.create({ data })
  },

  /** Tier-change timeline for a member, most recent first. */
  findHistoryByUser(userId: string) {
    return db.badgeHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    })
  },

  /** Members whose downgrade grace period has expired. */
  findUsersInExpiredGrace() {
    return db.badgeScore.findMany({
      where: { graceUntil: { lte: new Date() } },
    })
  },

  /** All active members (used by the monthly recalculation job). */
  findAllActiveUserIds() {
    return db.user.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    })
  },
}
