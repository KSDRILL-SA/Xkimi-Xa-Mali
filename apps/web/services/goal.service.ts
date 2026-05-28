import { db, Prisma } from '@/lib/db'
import { env } from '@/lib/env'
import { writeAuditLog } from './audit.service'
import type { CreateGoalInput, UpdateGoalInput, RecordProgressInput } from '@/lib/validation/goal'

// ─── Domain errors ──────────────────────────────────────────────────────────

export class GoalNotFoundError extends Error {
  code = 'GOL_001'
  status = 404
  constructor() { super('Goal not found') }
}

export class GoalConflictError extends Error {
  status = 409
  constructor(message: string, public code: string) { super(message) }
}

export class GoalForbiddenError extends Error {
  code = 'GOL_003'
  status = 403
  constructor(message: string) { super(message) }
}

// ─── Types ───────────────────────────────────────────────────────────────────

type GoalStatus = 'DRAFT' | 'ACTIVE' | 'ACHIEVED' | 'FAILED'

type GoalRow = {
  id: string
  type: string
  title: string
  description: string | null
  targetAmount: unknown
  currentAmount: unknown
  deadline: Date
  status: string
  lockedAt: Date | null
  lockedById: string | null
  createdAt: Date
  updatedAt: Date
}

// ─── Serialization ───────────────────────────────────────────────────────────

function serializeGoal(goal: GoalRow) {
  return {
    id: goal.id,
    type: goal.type,
    title: goal.title,
    description: goal.description,
    targetAmount: Number(goal.targetAmount),
    currentAmount: Number(goal.currentAmount),
    progressPct: Math.min(
      100,
      Math.round((Number(goal.currentAmount) / Number(goal.targetAmount)) * 100),
    ),
    deadline: goal.deadline.toISOString(),
    status: goal.status,
    isLocked: goal.lockedAt !== null,
    lockedAt: goal.lockedAt?.toISOString() ?? null,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
  }
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getGoals(
  status?: GoalStatus,
  page = 1,
  limit = 20,
) {
  const where = status ? { status } : {}
  const [items, total] = await Promise.all([
    db.goal.findMany({
      where,
      orderBy: { deadline: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.goal.count({ where }),
  ])

  return {
    items: (items as GoalRow[]).map(serializeGoal),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

export async function getGoal(id: string) {
  const goal = await db.goal.findUnique({
    where: { id },
    include: {
      progress: {
        orderBy: { recordedAt: 'desc' },
        take: 50,
      },
    },
  })

  if (!goal) throw new GoalNotFoundError()

  const g = goal as GoalRow & { progress: Array<{ id: string; amount: unknown; recordedAt: Date }> }

  return {
    ...serializeGoal(g),
    progress: g.progress.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      recordedAt: p.recordedAt.toISOString(),
    })),
  }
}

// ─── Admin mutations ──────────────────────────────────────────────────────────

export async function createGoal(
  input: CreateGoalInput,
  adminUserId: string,
  ip: string,
) {
  const goal = await db.goal.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      type: input.type,
      targetAmount: input.targetAmount,
      currentAmount: 0,
      deadline: new Date(input.deadline),
      status: 'DRAFT',
    },
  })

  await writeAuditLog({
    userId: adminUserId,
    action: 'GOAL_CREATED',
    entity: 'Goal',
    entityId: goal.id,
    payload: { title: input.title, targetAmount: input.targetAmount, type: input.type },
    ipAddress: ip,
  })

  return serializeGoal(goal as GoalRow)
}

export async function updateGoal(
  id: string,
  input: UpdateGoalInput,
  adminUserId: string,
  ip: string,
) {
  const existing = await db.goal.findUnique({ where: { id } })
  if (!existing) throw new GoalNotFoundError()

  const g = existing as GoalRow
  if (g.status !== 'DRAFT') {
    throw new GoalConflictError(
      'Only DRAFT goals can be updated',
      'GOL_004',
    )
  }
  if (g.lockedAt) {
    throw new GoalForbiddenError('Goal is locked and cannot be modified')
  }

  const updated = await db.goal.update({
    where: { id },
    data: {
      ...(input.title && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.type && { type: input.type }),
      ...(input.targetAmount !== undefined && { targetAmount: input.targetAmount }),
      ...(input.deadline && { deadline: new Date(input.deadline) }),
    },
  })

  await writeAuditLog({
    userId: adminUserId,
    action: 'GOAL_UPDATED',
    entity: 'Goal',
    entityId: id,
    payload: input as unknown as Prisma.InputJsonValue,
    ipAddress: ip,
  })

  return serializeGoal(updated as GoalRow)
}

export async function deleteGoal(id: string, adminUserId: string, ip: string) {
  const existing = await db.goal.findUnique({ where: { id } })
  if (!existing) throw new GoalNotFoundError()

  const g = existing as GoalRow
  if (g.status !== 'DRAFT') {
    throw new GoalConflictError('Only DRAFT goals can be deleted', 'GOL_005')
  }
  if (g.lockedAt) {
    throw new GoalForbiddenError('Goal is locked and cannot be deleted')
  }

  await db.goal.delete({ where: { id } })

  await writeAuditLog({
    userId: adminUserId,
    action: 'GOAL_DELETED',
    entity: 'Goal',
    entityId: id,
    payload: { title: g.title },
    ipAddress: ip,
  })
}

export async function activateGoal(id: string, adminUserId: string, ip: string) {
  const existing = await db.goal.findUnique({ where: { id } })
  if (!existing) throw new GoalNotFoundError()

  const g = existing as GoalRow
  if (g.status !== 'DRAFT') {
    throw new GoalConflictError(
      `Goal is already ${g.status.toLowerCase()} and cannot be activated`,
      'GOL_006',
    )
  }

  const updated = await db.goal.update({
    where: { id },
    data: { status: 'ACTIVE' },
  })

  await writeAuditLog({
    userId: adminUserId,
    action: 'GOAL_ACTIVATED',
    entity: 'Goal',
    entityId: id,
    payload: { title: g.title },
    ipAddress: ip,
  })

  return serializeGoal(updated as GoalRow)
}

export async function lockGoal(id: string, adminUserId: string, ip: string) {
  if (!env.ENABLE_GOAL_LOCKING) {
    throw new GoalForbiddenError('Goal locking is disabled in this environment')
  }

  const existing = await db.goal.findUnique({ where: { id } })
  if (!existing) throw new GoalNotFoundError()

  const g = existing as GoalRow
  if (g.lockedAt) {
    throw new GoalConflictError('Goal is already locked', 'GOL_007')
  }
  if (g.status === 'DRAFT') {
    throw new GoalConflictError('Activate the goal before locking it', 'GOL_008')
  }

  const updated = await db.goal.update({
    where: { id },
    data: { lockedAt: new Date(), lockedById: adminUserId },
  })

  await writeAuditLog({
    userId: adminUserId,
    action: 'GOAL_LOCKED',
    entity: 'Goal',
    entityId: id,
    payload: { title: g.title, lockedById: adminUserId },
    ipAddress: ip,
  })

  return serializeGoal(updated as GoalRow)
}

// ─── Progress recording ───────────────────────────────────────────────────────

export async function recordProgress(
  goalId: string,
  input: RecordProgressInput,
  adminUserId: string,
  ip: string,
) {
  const existing = await db.goal.findUnique({ where: { id: goalId } })
  if (!existing) throw new GoalNotFoundError()

  const g = existing as GoalRow
  if (g.status !== 'ACTIVE') {
    throw new GoalConflictError(
      'Progress can only be recorded on ACTIVE goals',
      'GOL_009',
    )
  }

  // Atomic: create progress entry + update currentAmount in one transaction
  const newTotal = Number(g.currentAmount) + input.amount

  const [progress] = await db.$transaction([
    db.goalProgress.create({
      data: {
        goalId,
        amount: input.amount,
      },
    }),
    db.goal.update({
      where: { id: goalId },
      data: {
        currentAmount: newTotal,
        // Auto-achieve when target is reached
        ...(newTotal >= Number(g.targetAmount) && { status: 'ACHIEVED' }),
      },
    }),
  ])

  await writeAuditLog({
    userId: adminUserId,
    action: 'GOAL_PROGRESS_RECORDED',
    entity: 'Goal',
    entityId: goalId,
    payload: { amount: input.amount, newTotal, note: input.note },
    ipAddress: ip,
  })

  return {
    id: progress.id,
    amount: Number(progress.amount),
    recordedAt: progress.recordedAt.toISOString(),
    newTotal,
    achieved: newTotal >= Number(g.targetAmount),
  }
}

export async function getGoalProgress(goalId: string, page = 1, limit = 20) {
  const existing = await db.goal.findUnique({ where: { id: goalId } })
  if (!existing) throw new GoalNotFoundError()

  const [items, total] = await Promise.all([
    db.goalProgress.findMany({
      where: { goalId },
      orderBy: { recordedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.goalProgress.count({ where: { goalId } }),
  ])

  return {
    items: (items as Array<{ id: string; amount: unknown; recordedAt: Date }>).map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      recordedAt: p.recordedAt.toISOString(),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

// ─── Inngest: deadline checker ────────────────────────────────────────────────

export async function markExpiredGoalsFailed(): Promise<number> {
  const now = new Date()

  const result = await db.goal.updateMany({
    where: {
      status: 'ACTIVE',
      deadline: { lt: now },
    },
    data: { status: 'FAILED' },
  })

  return result.count
}
