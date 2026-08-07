import { UserStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { logger } from '@xxm/observability'
import { assertAdmin, roundZAR, writeAuditLog, notifyInbox, AdminNotFoundError, AdminConflictError } from './shared'

// ─── Goals ────────────────────────────────────────────────────────────────────

export async function listAllGoals(adminRoles: string[], page = 1, limit = 20) {
  assertAdmin(adminRoles)
  const skip = (page - 1) * limit
  const [items, total] = await Promise.all([
    db.goal.findMany({
      skip, take: limit, orderBy: { createdAt: 'desc' },
      select: {
        id: true, title: true, type: true, status: true, targetAmount: true,
        currentAmount: true, deadline: true, lockedAt: true, isPrimary: true,
        createdAt: true, rejectionReason: true,
        // Who raised it. A draft from a member is a proposal awaiting review; a
        // draft from a leader is leadership's own note. Leadership has to be
        // able to tell them apart before deciding, so the creator's roles come
        // back with the row rather than being inferred from the status.
        creator: {
          select: {
            firstName: true, lastName: true,
            roles: { select: { role: { select: { name: true } } } },
          },
        },
      },
    }),
    db.goal.count(),
  ])
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) }
}

export async function getGoalById(adminRoles: string[], goalId: string) {
  assertAdmin(adminRoles)
  const goal = await db.goal.findUnique({
    where: { id: goalId },
    include: {
      progress: {
        orderBy: { recordedAt: 'desc' },
        take: 50,
        select: {
          id: true, amount: true, note: true, recordedAt: true,
          recordedBy: { select: { firstName: true, lastName: true } },
        },
      },
      creator: { select: { firstName: true, lastName: true } },
      locker:  { select: { firstName: true, lastName: true } },
    },
  })
  if (!goal) throw new AdminNotFoundError('Goal not found')
  return goal
}

export async function updateGoal(
  adminId: string, adminRoles: string[], goalId: string,
  data: { title?: string; description?: string | null; type?: string; targetAmount?: number; deadline?: string },
) {
  assertAdmin(adminRoles)
  const goal = await db.goal.findUnique({ where: { id: goalId } })
  if (!goal) throw new AdminNotFoundError('Goal not found')
  if (goal.status !== 'DRAFT') throw new AdminConflictError('Only DRAFT goals can be edited')
  if (goal.lockedAt) throw new AdminConflictError('Goal is locked and cannot be edited')

  const updated = await db.goal.update({
    where: { id: goalId },
    data: {
      ...(data.title && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.type && { type: data.type as 'MONTHLY' | 'YEARLY' | 'CUSTOM' }),
      ...(data.targetAmount !== undefined && { targetAmount: data.targetAmount }),
      ...(data.deadline && { deadline: new Date(data.deadline) }),
    },
  })
  await writeAuditLog({ userId: adminId, action: 'GOAL_UPDATED', entity: 'Goal', entityId: goalId, payload: data })
  return updated
}

export async function createGoal(
  adminId: string, adminRoles: string[],
  data: { title: string; description?: string; type: string; targetAmount: number; deadline: string },
) {
  assertAdmin(adminRoles)
  const goal = await db.goal.create({
    data: {
      title: data.title,
      description: data.description ?? null,
      type: data.type as 'MONTHLY' | 'YEARLY' | 'CUSTOM',
      targetAmount: data.targetAmount,
      currentAmount: 0,
      deadline: new Date(data.deadline),
      status: 'DRAFT',
      createdById: adminId,
    },
  })
  await writeAuditLog({ userId: adminId, action: 'GOAL_CREATED', entity: 'Goal', entityId: goal.id, payload: data })
  return goal
}

export async function activateGoal(adminId: string, adminRoles: string[], goalId: string) {
  assertAdmin(adminRoles)
  const goal = await db.goal.findUnique({ where: { id: goalId } })
  if (!goal) throw new AdminNotFoundError('Goal not found')
  if (goal.status !== 'DRAFT') throw new AdminConflictError('Only DRAFT goals can be activated')
  const updated = await db.goal.update({
    where: { id: goalId },
    data: { status: 'ACTIVE', reviewedById: adminId, reviewedAt: new Date() },
  })
  await writeAuditLog({ userId: adminId, action: 'GOAL_ACTIVATED', entity: 'Goal', entityId: goalId, payload: { title: goal.title } })

  // Step 2 of the guide's flow is "leadership reviews it". A review nobody
  // hears the result of is not a review. Only the proposer is told here — the
  // whole circle already learns of an activated goal through its own channel.
  await notifyProposer(goal.createdById, adminId, {
    title: `Your Goal "${goal.title}" has been approved`,
    body: `Leadership has reviewed and approved "${goal.title}". It is now active and open to the circle.`,
  })

  return updated
}

/**
 * Leadership refuses a proposal.
 *
 * The proposal is kept, not deleted — a fifth `GoalStatus`, decided by the
 * founders on the guide's own principle that nothing is quietly removed. The
 * member who proposed it can see it was considered and answered, and read why.
 *
 * A reason is required for the same reason a reversal needs one: an answer with
 * no cause tells the member nothing and leaves nothing to retrace.
 */
export async function rejectGoal(
  adminId: string, adminRoles: string[],
  goalId: string, reason: string, ip?: string,
) {
  assertAdmin(adminRoles)

  const trimmed = reason?.trim() ?? ''
  if (trimmed.length < 10) {
    throw new AdminConflictError('A reason of at least 10 characters is required to decline a proposal')
  }

  const goal = await db.goal.findUnique({ where: { id: goalId } })
  if (!goal) throw new AdminNotFoundError('Goal not found')
  if (goal.status !== 'DRAFT') throw new AdminConflictError('Only DRAFT goals can be declined')

  const updated = await db.goal.update({
    where: { id: goalId },
    data: {
      status: 'REJECTED',
      rejectionReason: trimmed,
      reviewedById: adminId,
      reviewedAt: new Date(),
    },
  })

  await writeAuditLog({
    userId: adminId, action: 'GOAL_REJECTED', entity: 'Goal', entityId: goalId,
    payload: { title: goal.title, reason: trimmed }, ipAddress: ip,
  })

  await notifyProposer(goal.createdById, adminId, {
    title: `Your Goal "${goal.title}" was not taken forward`,
    body:
      `Leadership has reviewed "${goal.title}" and decided not to take it forward. ` +
      `Reason given: ${trimmed} — the proposal stays on the record, and you are welcome ` +
      `to raise it with any leader.`,
  })

  return updated
}

/**
 * Tell whoever proposed a goal what leadership decided.
 *
 * Silent when leadership raised the goal themselves — an admin does not need an
 * inbox message about their own decision — and best-effort, because a review
 * that has already been recorded must not fail on a notification.
 */
async function notifyProposer(
  createdById: string | null,
  adminId: string,
  msg: { title: string; body: string },
) {
  if (!createdById || createdById === adminId) return
  await notifyInbox({
    userId: createdById,
    title: msg.title,
    body: msg.body,
    category: 'GOAL',
    createdById: adminId,
  })
}

export async function lockGoal(adminId: string, adminRoles: string[], goalId: string) {
  assertAdmin(adminRoles)
  const goal = await db.goal.findUnique({ where: { id: goalId } })
  if (!goal) throw new AdminNotFoundError('Goal not found')
  if (goal.lockedAt) throw new AdminConflictError('Goal is already locked')
  if (goal.status === 'DRAFT') throw new AdminConflictError('Activate the goal before locking it')
  const updated = await db.goal.update({
    where: { id: goalId },
    data: { lockedAt: new Date(), lockedById: adminId },
  })
  await writeAuditLog({ userId: adminId, action: 'GOAL_LOCKED', entity: 'Goal', entityId: goalId, payload: { title: goal.title } })
  return updated
}

/**
 * Recompute the primary fund's total from the money that actually landed: every
 * contribution paid in the fund's deadline-year plus any extra payments members
 * directed straight at it. The primary fund's `currentAmount` is DERIVED, never
 * hand-typed — that is what keeps it honest and reversal-safe.
 *
 * The ACTIVE→ACHIEVED transition is deliberately NOT made here. The member app
 * owns that transition (it also fires the group celebration), and it re-syncs
 * after every payment and nightly — so leaving status alone here guarantees the
 * celebration is never silently skipped.
 *
 */
async function derivePrimaryFundTotal(goal: { id: string; currentAmount: unknown; deadline: Date }) {
  const year = goal.deadline.getFullYear()
  const [contributions, directPayments] = await Promise.all([
    db.contribution.aggregate({ where: { periodYear: year }, _sum: { amountPaid: true } }),
    db.goalPayment.aggregate({ where: { goalId: goal.id, status: 'SUCCESS' }, _sum: { amount: true } }),
  ])

  const pooled = roundZAR(
    Number(contributions._sum.amountPaid ?? 0) + Number(directPayments._sum.amount ?? 0),
  )
  if (roundZAR(Number(goal.currentAmount)) === pooled) return

  await db.goal.update({ where: { id: goal.id }, data: { currentAmount: pooled } })
}

/**
 * Designate a goal as THE primary fund — the common yearly pot every monthly
 * contribution flows into. At most one goal may hold the flag (enforced by a
 * partial unique index), so the current holder is demoted in the same
 * transaction as the new one is promoted.
 */
export async function setPrimaryGoal(adminId: string, adminRoles: string[], goalId: string) {
  assertAdmin(adminRoles)
  const goal = await db.goal.findUnique({ where: { id: goalId } })
  if (!goal) throw new AdminNotFoundError('Goal not found')
  if (goal.status !== 'ACTIVE') throw new AdminConflictError('Only an active goal can be set as the primary fund')
  if (goal.isPrimary) return goal

  const updated = await db.$transaction(async (tx) => {
    await tx.goal.updateMany({ where: { isPrimary: true }, data: { isPrimary: false } })
    return tx.goal.update({ where: { id: goalId }, data: { isPrimary: true } })
  })

  await writeAuditLog({ userId: adminId, action: 'GOAL_SET_PRIMARY', entity: 'Goal', entityId: goalId, payload: { title: goal.title } })

  // Fill the fund with what members have already paid, so it reads true the
  // moment it is designated instead of waiting for the next payment or the
  // nightly sync. Best-effort — the designation itself has already succeeded.
  try {
    await derivePrimaryFundTotal(updated)
  } catch (err) {
    logger.error('Primary fund initial sync failed', { err, goalId })
  }

  return updated
}

export async function deleteGoal(adminId: string, adminRoles: string[], goalId: string) {
  assertAdmin(adminRoles)
  const goal = await db.goal.findUnique({ where: { id: goalId } })
  if (!goal) throw new AdminNotFoundError('Goal not found')
  if (goal.status !== 'DRAFT') throw new AdminConflictError('Only DRAFT goals can be deleted')
  await db.goal.delete({ where: { id: goalId } })
  await writeAuditLog({ userId: adminId, action: 'GOAL_DELETED', entity: 'Goal', entityId: goalId, payload: { title: goal.title } })
}

export async function recordGoalProgress(
  adminId: string, adminRoles: string[], goalId: string, amount: number, note?: string,
) {
  assertAdmin(adminRoles)
  const goal = await db.goal.findUnique({ where: { id: goalId } })
  if (!goal) throw new AdminNotFoundError('Goal not found')
  if (goal.status !== 'ACTIVE') throw new AdminConflictError('Progress can only be recorded on ACTIVE goals')
  // The primary fund's total is derived from real contributions and directed
  // payments; a hand-typed figure would be silently overwritten by the next sync
  // and would leave a phantom progress record behind. Refuse it outright.
  if (goal.isPrimary) {
    throw new AdminConflictError('The primary fund fills automatically from contributions and cannot be adjusted manually')
  }
  const newTotal = roundZAR(Number(goal.currentAmount) + amount)
  const goalVersion = (goal as typeof goal & { version: number }).version
  const progress = await db.$transaction(async (tx) => {
    const record = await tx.goalProgress.create({ data: { goalId, amount, note: note ?? null, recordedById: adminId } })
    const updated = await tx.goal.updateMany({
      where: { id: goalId, version: goalVersion },
      data: {
        currentAmount: newTotal,
        version: goalVersion + 1,
        ...(newTotal >= Number(goal.targetAmount) && { status: 'ACHIEVED' }),
      },
    })
    if (updated.count === 0) throw new AdminConflictError('Concurrent modification detected — retry required')
    return record
  })
  await writeAuditLog({ userId: adminId, action: 'GOAL_PROGRESS_RECORDED', entity: 'Goal', entityId: goalId, payload: { amount, newTotal, note } })

  const achieved = newTotal >= Number(goal.targetAmount)

  // Intelligent system behaviour: when a goal is reached, the engine proactively
  // celebrates it in every active member's inbox. Best-effort — a failure here
  // must never undo the recorded progress.
  if (achieved) {
    try {
      const members = await db.user.findMany({ where: { status: UserStatus.ACTIVE }, select: { id: true } })
      if (members.length > 0) {
        const target = `R ${Number(goal.targetAmount).toLocaleString('en-ZA')}`
        await db.inboxMessage.createMany({
          data: members.map((m) => ({
            userId: m.id,
            title: `Goal achieved: ${goal.title} 🎉`,
            body: `The brotherhood reached its "${goal.title}" target of ${target}. Well done — every contribution counted.`,
            category: 'GOAL',
            createdById: adminId,
          })),
        })
      }
    } catch (err) {
      logger.error('Goal-achieved inbox fan-out failed', { err, goalId })
    }
  }

  return { id: progress.id, amount: Number(progress.amount), newTotal, achieved }
}
