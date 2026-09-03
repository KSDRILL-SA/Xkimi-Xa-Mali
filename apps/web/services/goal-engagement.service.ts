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

export type PledgeSummary = {
  pledgeTotal: number
  pledgeCount: number
  myPledge: number | null
}

export type GoalEngagement = {
  cheerCount: number
  hasCheered: boolean
  comments: GoalComment[]
  pledge: PledgeSummary
  /** What the viewer has actually paid toward this goal. See `myPayments`. */
  payments: MyGoalPayment[]
}

/**
 * One payment the viewer made toward this goal.
 *
 * A pledge is a promise and was already visible; a payment is money, and until
 * now the member could see it nowhere at all. Their transactions page lists
 * `Transaction` rows, and a goal payment is not one — so a member who gave to a
 * goal had no record of having done so anywhere in the app.
 *
 * That was tolerable while every goal payment went through the gateway, because
 * the member initiated it themselves and their bank statement said so. It is
 * not tolerable now: leadership records these on the member's behalf from cash
 * or an EFT, and a payment somebody else entered against your name that you
 * cannot see is exactly the thing the proof-of-payment work exists to prevent.
 */
export type MyGoalPayment = {
  id: string
  amount: number
  /** When the money arrived, falling back to when the row was written. */
  paidAt: string
  /** The bank reference for an offline payment; the gateway's otherwise. */
  reference: string | null
  /** Openable only through /api/media/proof, which re-checks ownership. */
  proofUrl: string | null
  /** Who counted the cash, when there was no document. */
  proofWitness: string | null
  /** True when leadership recorded this rather than the member paying in-app. */
  recordedByLeadership: boolean
}

const MIN_PLEDGE = 10
const MAX_PLEDGE = 1_000_000

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

  const [cheerCount, myCheer, comments, pledge, payments] = await Promise.all([
    db.goalCheer.count({ where: { goalId } }),
    db.goalCheer.findUnique({ where: { goalId_userId: { goalId, userId } } }),
    db.goalComment.findMany({
      where: { goalId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: COMMENT_LIMIT,
      select: COMMENT_SELECT,
    }),
    getGoalPledgeSummary(goalId, userId),
    // Scoped to this viewer, never the goal's payments at large. What everyone
    // together has given is already public as the goal's total; who gave what
    // is not, and this endpoint is reached by any member who can see the goal.
    db.goalPayment.findMany({
      where: { goalId, userId, status: 'SUCCESS' },
      orderBy: [{ processedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true, amount: true, processedAt: true, createdAt: true,
        gatewayRef: true, offlineReference: true,
        proofUrl: true, proofWitness: true, recordedById: true,
      },
    }),
  ])

  return {
    cheerCount,
    hasCheered: myCheer !== null,
    comments: comments.map((c) => serializeComment(c, userId, roles)),
    pledge,
    payments: payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      paidAt: (p.processedAt ?? p.createdAt).toISOString(),
      reference: p.offlineReference ?? p.gatewayRef,
      proofUrl: p.proofUrl,
      proofWitness: p.proofWitness,
      recordedByLeadership: p.recordedById !== null,
    })),
  }
}

/** Total pledged toward a goal, how many members pledged, and the viewer's pledge. */
export async function getGoalPledgeSummary(goalId: string, userId: string): Promise<PledgeSummary> {
  const [agg, mine] = await Promise.all([
    db.goalPledge.aggregate({ where: { goalId }, _sum: { amount: true }, _count: true }),
    db.goalPledge.findUnique({ where: { goalId_userId: { goalId, userId } }, select: { amount: true } }),
  ])
  return {
    pledgeTotal: Number(agg._sum.amount ?? 0),
    pledgeCount: agg._count,
    myPledge: mine ? Number(mine.amount) : null,
  }
}

/** Create or update the viewer's pledge toward an active goal. */
export async function setGoalPledge(goalId: string, userId: string, amount: number, roles: string[]): Promise<PledgeSummary> {
  const goal = await goalRepo.findById(goalId)
  if (!goal) throw new GoalNotFoundError()
  const status = (goal as { status: string }).status
  if (status === 'DRAFT' && !isAdmin(roles)) throw new GoalNotFoundError()
  if (status !== 'ACTIVE') throw new ValidationError('You can only pledge toward an active goal')
  if (!Number.isFinite(amount) || amount < MIN_PLEDGE || amount > MAX_PLEDGE) {
    throw new ValidationError(`Pledge must be between R${MIN_PLEDGE} and R${MAX_PLEDGE.toLocaleString('en-ZA')}`)
  }

  const rounded = Math.round(amount * 100) / 100
  await db.goalPledge.upsert({
    where: { goalId_userId: { goalId, userId } },
    create: { goalId, userId, amount: rounded },
    update: { amount: rounded },
  })
  return getGoalPledgeSummary(goalId, userId)
}

/** Withdraw the viewer's pledge. */
export async function cancelGoalPledge(goalId: string, userId: string): Promise<PledgeSummary> {
  await db.goalPledge.deleteMany({ where: { goalId, userId } })
  return getGoalPledgeSummary(goalId, userId)
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002'
}

/**
 * Toggle the viewer's cheer on a goal. Atomic and race-safe: we try to remove an
 * existing cheer and only add one if nothing was removed, so rapid double-clicks
 * (and concurrent requests) can't trip the unique constraint into a 500.
 */
export async function toggleGoalCheer(goalId: string, userId: string, roles: string[]): Promise<{ cheered: boolean; cheerCount: number }> {
  await assertGoalVisible(goalId, roles)

  const removed = await db.goalCheer.deleteMany({ where: { goalId, userId } })
  let cheered = false
  if (removed.count === 0) {
    try {
      await db.goalCheer.create({ data: { goalId, userId } })
      cheered = true
    } catch (e) {
      // A concurrent request already created the cheer — treat as cheering.
      if (!isUniqueViolation(e)) throw e
      cheered = true
    }
  }

  const cheerCount = await db.goalCheer.count({ where: { goalId } })
  return { cheered, cheerCount }
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
