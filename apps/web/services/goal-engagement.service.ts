import { db } from '@/lib/db'
import { goalRepo } from '@/repositories/goal.repository'
import { isAdmin } from '@/lib/authorization'
import { writeAuditLog } from './audit.service'
import { GoalNotFoundError, ForbiddenError, ValidationError, NotFoundError } from '@/lib/errors'

const MAX_COMMENT_LENGTH = 500
const COMMENT_LIMIT = 100

export type GoalComment = {
  id: string
  content: string
  createdAt: string
  authorId: string
  authorName: string
  isMine: boolean
  canDelete: boolean
}

export type GoalEngagement = {
  cheerCount: number
  hasCheered: boolean
  comments: GoalComment[]
}

/**
 * Loads a goal and enforces visibility: draft goals are admin-only, so members
 * can only engage with goals they can actually see.
 */
async function assertGoalVisible(goalId: string, roles: string[]): Promise<void> {
  const goal = await goalRepo.findById(goalId)
  if (!goal) throw new GoalNotFoundError()
  if ((goal as { status: string }).status === 'DRAFT' && !isAdmin(roles)) throw new GoalNotFoundError()
}

function serializeComment(
  c: { id: string; content: string; createdAt: Date; userId: string; user: { firstName: string; lastName: string } },
  userId: string,
  roles: string[],
): GoalComment {
  const isMine = c.userId === userId
  return {
    id: c.id,
    content: c.content,
    createdAt: c.createdAt.toISOString(),
    authorId: c.userId,
    authorName: `${c.user.firstName} ${c.user.lastName}`,
    isMine,
    canDelete: isMine || isAdmin(roles),
  }
}

const COMMENT_SELECT = {
  id: true, content: true, createdAt: true, userId: true,
  user: { select: { firstName: true, lastName: true } },
} as const

/** Cheer count, whether the viewer has cheered, and the comment thread. */
export async function getGoalEngagement(goalId: string, userId: string, roles: string[]): Promise<GoalEngagement> {
  await assertGoalVisible(goalId, roles)

  const [cheerCount, myCheer, comments] = await Promise.all([
    db.goalCheer.count({ where: { goalId } }),
    db.goalCheer.findUnique({ where: { goalId_userId: { goalId, userId } } }),
    db.goalComment.findMany({
      where: { goalId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: COMMENT_LIMIT,
      select: COMMENT_SELECT,
    }),
  ])

  return {
    cheerCount,
    hasCheered: myCheer !== null,
    comments: comments.map((c) => serializeComment(c, userId, roles)),
  }
}

/** Toggle the viewer's cheer on a goal. Returns the new state + total. */
export async function toggleGoalCheer(goalId: string, userId: string, roles: string[]): Promise<{ cheered: boolean; cheerCount: number }> {
  await assertGoalVisible(goalId, roles)

  const existing = await db.goalCheer.findUnique({ where: { goalId_userId: { goalId, userId } } })
  if (existing) {
    await db.goalCheer.delete({ where: { id: existing.id } })
  } else {
    await db.goalCheer.create({ data: { goalId, userId } })
  }

  const cheerCount = await db.goalCheer.count({ where: { goalId } })
  return { cheered: existing === null, cheerCount }
}

/** Post a comment on a goal. */
export async function addGoalComment(goalId: string, userId: string, content: string, roles: string[]): Promise<GoalComment> {
  await assertGoalVisible(goalId, roles)

  const trimmed = content.trim()
  if (trimmed.length === 0 || trimmed.length > MAX_COMMENT_LENGTH) {
    throw new ValidationError(`Comment must be between 1 and ${MAX_COMMENT_LENGTH} characters`)
  }

  const created = await db.goalComment.create({
    data: { goalId, userId, content: trimmed },
    select: COMMENT_SELECT,
  })

  return serializeComment(created, userId, roles)
}

/** Soft-delete a comment. Authors can delete their own; admins can moderate any. */
export async function deleteGoalComment(goalId: string, commentId: string, userId: string, roles: string[]): Promise<void> {
  const comment = await db.goalComment.findUnique({ where: { id: commentId } })
  if (!comment || comment.isDeleted || comment.goalId !== goalId) throw new NotFoundError('Comment not found')

  const isOwner = comment.userId === userId
  if (!isOwner && !isAdmin(roles)) throw new ForbiddenError('You can only delete your own comments')

  await db.goalComment.update({
    where: { id: commentId },
    data: { isDeleted: true, deletedById: userId, deletedAt: new Date() },
  })

  if (!isOwner) {
    await writeAuditLog({
      userId,
      action: 'GOAL_COMMENT_MODERATED',
      entity: 'GoalComment',
      entityId: commentId,
      payload: { goalId },
    })
  }
}
