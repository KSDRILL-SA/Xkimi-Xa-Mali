import { Prisma } from '@prisma/client'
import { goalRepo, runTransaction } from '@/repositories/goal.repository'
import { env } from '@/lib/env'
import { writeAuditLog } from './audit.service'
import { logger } from '@/lib/logger'
import { GoalNotFoundError, GoalConflictError, ForbiddenError } from '@/lib/errors'
import { isAdmin } from '@/lib/authorization'
import type { CreateGoalInput, UpdateGoalInput, RecordProgressInput } from '@/lib/validation/goal'
import { cache, CACHE_KEYS } from '@/lib/cache'

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
  version: number
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

// Evicts the first few pages across all status filters. Goals are a small
// dataset (admin-only writes, infrequent mutations) so clearing common pages is
// sufficient — the TTL handles any long-tail cache entries.
async function evictGoalsCache(): Promise<void> {
  const statuses = ['all', 'DRAFT', 'ACTIVE', 'ACHIEVED', 'FAILED']
  const pages = [1, 2, 3]
  const limits = [20, 50]
  const keys = statuses.flatMap((s) => pages.flatMap((p) => limits.map((l) => CACHE_KEYS.goalsPage(s, p, l))))
  await cache.del(...keys)
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export async function getGoals(
  status?: GoalStatus,
  page = 1,
  limit = 20,
  roles: string[] = [],
) {
  const effectiveStatus = status === 'DRAFT' && !isAdmin(roles) ? undefined : status
  const cacheKey = CACHE_KEYS.goalsPage(effectiveStatus ?? (isAdmin(roles) ? 'all' : 'public'), page, limit)
  const cached = await cache.get<{
    items: ReturnType<typeof serializeGoal>[]
    total: number
    page: number
    limit: number
    totalPages: number
  }>(cacheKey)
  if (cached) return cached

  const where = effectiveStatus
    ? { status: effectiveStatus }
    : isAdmin(roles)
      ? {}
      : { status: { not: 'DRAFT' as const } }
  const [items, total] = await Promise.all([
    goalRepo.findMany(where, {
      orderBy: { deadline: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    goalRepo.count(where),
  ])

  const result = {
    items: (items as GoalRow[]).map(serializeGoal),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }

  await cache.set(cacheKey, result, CACHE_KEYS.GOALS_TTL)
  return result
}

export async function getGoal(id: string) {
  const goal = await goalRepo.findById(id, {
    progress: {
      orderBy: { recordedAt: 'desc' },
      take: 50,
    },
  })

  if (!goal) throw new GoalNotFoundError()

  const g = goal as unknown as GoalRow & { progress: Array<{ id: string; amount: unknown; recordedAt: Date }> }

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
  const goal = await goalRepo.create({
    title: input.title,
    description: input.description ?? null,
    type: input.type,
    targetAmount: input.targetAmount,
    currentAmount: 0,
    deadline: new Date(input.deadline),
    status: 'DRAFT',
    createdById: adminUserId,
  })

  await Promise.all([
    writeAuditLog({
      userId: adminUserId,
      action: 'GOAL_CREATED',
      entity: 'Goal',
      entityId: goal.id,
      payload: { title: input.title, targetAmount: input.targetAmount, type: input.type },
      ipAddress: ip,
    }),
    evictGoalsCache(),
  ])

  return serializeGoal(goal as GoalRow)
}

export async function updateGoal(
  id: string,
  input: UpdateGoalInput,
  adminUserId: string,
  ip: string,
) {
  const existing = await goalRepo.findById(id)
  if (!existing) throw new GoalNotFoundError()

  const g = existing as GoalRow
  if (g.status !== 'DRAFT') {
    throw new GoalConflictError(
      'Only DRAFT goals can be updated',
      'GOL_004',
    )
  }
  if (g.lockedAt) {
    throw new ForbiddenError('Goal is locked and cannot be modified')
  }

  const updated = await goalRepo.update(id, {
    ...(input.title && { title: input.title }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.type && { type: input.type }),
    ...(input.targetAmount !== undefined && { targetAmount: input.targetAmount }),
    ...(input.deadline && { deadline: new Date(input.deadline) }),
  })

  await Promise.all([
    writeAuditLog({
      userId: adminUserId,
      action: 'GOAL_UPDATED',
      entity: 'Goal',
      entityId: id,
      payload: input as unknown as Prisma.InputJsonValue,
      ipAddress: ip,
    }),
    evictGoalsCache(),
  ])

  return serializeGoal(updated as GoalRow)
}

export async function deleteGoal(id: string, adminUserId: string, ip: string) {
  const existing = await goalRepo.findById(id)
  if (!existing) throw new GoalNotFoundError()

  const g = existing as GoalRow
  if (g.status !== 'DRAFT') {
    throw new GoalConflictError('Only DRAFT goals can be deleted', 'GOL_005')
  }
  if (g.lockedAt) {
    throw new ForbiddenError('Goal is locked and cannot be deleted')
  }

  await goalRepo.delete(id)

  await Promise.all([
    writeAuditLog({
      userId: adminUserId,
      action: 'GOAL_DELETED',
      entity: 'Goal',
      entityId: id,
      payload: { title: g.title },
      ipAddress: ip,
    }),
    evictGoalsCache(),
  ])
}

export async function activateGoal(id: string, adminUserId: string, ip: string) {
  const existing = await goalRepo.findById(id)
  if (!existing) throw new GoalNotFoundError()

  const g = existing as GoalRow
  if (g.status !== 'DRAFT') {
    throw new GoalConflictError(
      `Goal is already ${g.status.toLowerCase()} and cannot be activated`,
      'GOL_006',
    )
  }

  const updated = await goalRepo.update(id, { status: 'ACTIVE' })

  await Promise.all([
    writeAuditLog({
      userId: adminUserId,
      action: 'GOAL_ACTIVATED',
      entity: 'Goal',
      entityId: id,
      payload: { title: g.title },
      ipAddress: ip,
    }),
    evictGoalsCache(),
  ])

  return serializeGoal(updated as GoalRow)
}

export async function lockGoal(id: string, adminUserId: string, ip: string) {
  if (!env.ENABLE_GOAL_LOCKING) {
    throw new ForbiddenError('Goal locking is disabled in this environment')
  }

  const existing = await goalRepo.findById(id)
  if (!existing) throw new GoalNotFoundError()

  const g = existing as GoalRow
  if (g.lockedAt) {
    throw new GoalConflictError('Goal is already locked', 'GOL_007')
  }
  if (g.status === 'DRAFT') {
    throw new GoalConflictError('Activate the goal before locking it', 'GOL_008')
  }

  const updated = await goalRepo.update(id, { lockedAt: new Date(), lockedById: adminUserId })

  await Promise.all([
    writeAuditLog({
      userId: adminUserId,
      action: 'GOAL_LOCKED',
      entity: 'Goal',
      entityId: id,
      payload: { title: g.title, lockedById: adminUserId },
      ipAddress: ip,
    }),
    evictGoalsCache(),
  ])

  return serializeGoal(updated as GoalRow)
}

// ─── Progress recording ───────────────────────────────────────────────────────

export async function recordProgress(
  goalId: string,
  input: RecordProgressInput,
  adminUserId: string,
  ip: string,
) {
  const existing = await goalRepo.findById(goalId)
  if (!existing) throw new GoalNotFoundError()

  const g = existing as GoalRow
  if (g.status !== 'ACTIVE') {
    throw new GoalConflictError(
      'Progress can only be recorded on ACTIVE goals',
      'GOL_009',
    )
  }

  const newTotal = Number(g.currentAmount) + input.amount

  const progress = await runTransaction(async (tx) => {
    const record = await goalRepo.createProgress(
      {
        goalId,
        amount: input.amount,
        note: input.note ?? null,
        recordedById: adminUserId,
      },
      tx,
    )

    const updated = await goalRepo.updateGoalInTx(
      { id: goalId, version: g.version },
      {
        currentAmount: newTotal,
        version: g.version + 1,
        ...(newTotal >= Number(g.targetAmount) && { status: 'ACHIEVED' }),
      },
      tx,
    )

    if (updated.count === 0) {
      throw new Error('Concurrent modification detected on goal — retry required')
    }

    return record
  })

  await Promise.all([
    writeAuditLog({
      userId: adminUserId,
      action: 'GOAL_PROGRESS_RECORDED',
      entity: 'Goal',
      entityId: goalId,
      payload: { amount: input.amount, newTotal, note: input.note },
      ipAddress: ip,
    }),
    evictGoalsCache(),
  ])

  return {
    id: progress.id,
    amount: Number(progress.amount),
    recordedAt: progress.recordedAt.toISOString(),
    newTotal,
    achieved: newTotal >= Number(g.targetAmount),
  }
}

export async function getGoalProgress(goalId: string, page = 1, limit = 20) {
  const existing = await goalRepo.findById(goalId)
  if (!existing) throw new GoalNotFoundError()

  const [items, total] = await Promise.all([
    goalRepo.findProgress(goalId, {
      orderBy: { recordedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    goalRepo.countProgress({ goalId }),
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

  const result = await goalRepo.updateMany(
    {
      status: 'ACTIVE',
      deadline: { lt: now },
    },
    { status: 'FAILED' },
  )

  return result.count
}
