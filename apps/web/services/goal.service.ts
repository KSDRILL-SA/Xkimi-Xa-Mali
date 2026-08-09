import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { goalRepo, runTransaction } from '@/repositories/goal.repository'
import { env } from '@/lib/env'
import { writeAuditLog } from './audit.service'
import { GoalNotFoundError, GoalConflictError, ForbiddenError } from '@/lib/errors'
import { isAdmin, assertAdmin } from '@/lib/authorization'
import type { CreateGoalInput, UpdateGoalInput, RecordProgressInput } from '@/lib/validation/goal'
import { cache, CACHE_KEYS } from '@/lib/cache'
import { roundZAR, sumZAR, subtractZAR } from '@/lib/money'
import { inngest, InngestEvents } from '@/lib/inngest'
import { createInboxMessages, notifyAdmins } from './inbox.service'
import { logger } from '@xxm/observability'

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
  isPrimary: boolean
  version: number
  lockedAt: Date | null
  lockedById: string | null
  outcomeNote: string | null
  outcomeProofUrl: string | null
  outcomeRecordedAt: Date | null
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
    progressPct: Number(goal.targetAmount) > 0
      ? Math.min(100, Math.round((Number(goal.currentAmount) / Number(goal.targetAmount)) * 100))
      : 0,
    remaining: Math.max(0, subtractZAR(Number(goal.targetAmount), Number(goal.currentAmount))),
    // Whole days until the deadline, negative once past. Derived here, with the
    // other computed fields, because a component that reads the clock while
    // rendering produces output that depends on when it happened to run — which
    // is what React's purity rule forbids. This function is not a component.
    daysLeft: Math.ceil((goal.deadline.getTime() - Date.now()) / 86_400_000),
    deadline: goal.deadline.toISOString(),
    status: goal.status,
    isPrimary: goal.isPrimary,
    isLocked: goal.lockedAt !== null,
    lockedAt: goal.lockedAt?.toISOString() ?? null,
    // Step 6 of the Goal flow: what the money actually bought. Null until
    // leadership documents it, and on every goal achieved before outcomes were
    // recorded at all — which is the honest answer for those, not a blank.
    outcomeNote: goal.outcomeNote ?? null,
    outcomeProofUrl: goal.outcomeProofUrl ?? null,
    outcomeRecordedAt: goal.outcomeRecordedAt?.toISOString() ?? null,
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
  }
}

/**
 * The status keys `getGoals` can actually write, not the statuses a goal has.
 *
 * `'public'` is the one that was missing, and it is the one every ordinary
 * member uses: a member browsing the goals page with no filter is cached under
 * `goalsPage('public', ...)`, because that is what the audience is, not what
 * the status is. It was absent from the eviction sweep, so an admin activating
 * a goal or recording progress cleared the admin's view and left every member
 * looking at the old numbers until the TTL expired.
 *
 * `'all'` is the admin's unfiltered equivalent. The four `GoalStatus` values
 * are what either audience gets when it names a filter.
 */
const GOAL_CACHE_AUDIENCES = ['all', 'public', 'DRAFT', 'ACTIVE', 'ACHIEVED', 'FAILED'] as const

/**
 * Every page size a caller in this codebase actually asks for.
 *
 * 3 is the dashboard's active-goals panel, and it was missing too — so that
 * panel showed stale progress after any goal change. 20 is the default, 50 the
 * API's ceiling.
 *
 * A caller asking for some other size — the API accepts anything up to 50 —
 * keeps its entry until the TTL. That is the long tail the TTL is for; what
 * must not be stale is the view somebody actually looks at.
 */
const GOAL_CACHE_LIMITS = [3, 20, 50] as const

/**
 * Evict the goal list pages a reader is likely to be holding.
 *
 * Goals are a small, admin-written dataset, so sweeping the common keys is
 * enough and the TTL covers the rest. What matters is that the sweep covers
 * every key the *callers* generate — it did not, and the gap was invisible
 * because the missing keys belong to members rather than to the admin doing
 * the writing.
 */
export async function evictGoalsCache(): Promise<void> {
  const pages = [1, 2, 3]
  const keys = GOAL_CACHE_AUDIENCES.flatMap((s) =>
    pages.flatMap((p) => GOAL_CACHE_LIMITS.map((l) => CACHE_KEYS.goalsPage(s, p, l))),
  )
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

export async function getGoal(id: string, roles: string[] = []) {
  const goal = await goalRepo.findById(id, {
    progress: {
      orderBy: { recordedAt: 'desc' },
      take: 50,
    },
  })

  if (!goal) throw new GoalNotFoundError()

  const g = goal as unknown as GoalRow & { progress: Array<{ id: string; amount: unknown; recordedAt: Date }> }

  if (g.status === 'DRAFT' && !isAdmin(roles)) {
    throw new GoalNotFoundError()
  }

  return {
    ...serializeGoal(g),
    progress: g.progress.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      recordedAt: p.recordedAt.toISOString(),
    })),
  }
}

/** Lightweight status counts for dashboard summaries — avoids loading full goal rows. */
export async function getGoalStatusCounts(): Promise<{ active: number; achieved: number }> {
  const [active, achieved] = await Promise.all([
    goalRepo.count({ status: 'ACTIVE' }),
    goalRepo.count({ status: 'ACHIEVED' }),
  ])

  return { active, achieved }
}

/** The one primary yearly fund, if a goal has been designated — else null. */
export async function getPrimaryGoal() {
  const goals = await goalRepo.findMany({ isPrimary: true }, { take: 1 })
  const goal = goals[0]
  return goal ? serializeGoal(goal as GoalRow) : null
}

/**
 * Announce that a goal reached its target. Best-effort — a hiccup emitting the
 * celebration must never block the money flow that triggered it. Fire only on the
 * ACTIVE→ACHIEVED transition so the group is congratulated exactly once.
 */
export async function emitGoalAchieved(goalId: string, title: string): Promise<void> {
  await inngest
    .send({ name: InngestEvents.GOAL_ACHIEVED, data: { goalId, title } })
    .catch((err) => logger.error('Failed to emit goal.achieved', {
      goalId, error: err instanceof Error ? err.message : String(err),
    }))
}

/** Fan a goal-achieved celebration out to every active member's inbox. */
export async function celebrateGoalAchieved(title: string): Promise<number> {
  const members = await db.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })
  return createInboxMessages(members.map((m) => m.id), {
    title: '🎉 Goal achieved!',
    body: `We did it — "${title}" is fully funded. Thank you for showing up, brothers. On to the next one. 💪`,
    category: 'GOAL',
  })
}

/**
 * Keep the primary fund's progress in step with real contributions. Its
 * currentAmount is DERIVED — the sum of every contribution paid in the fund's
 * year — so it is always accurate and inherently reversal-safe (a reversal
 * lowers the sum, and the next sync reflects it). Best-effort and idempotent:
 * only writes when the figure actually moved, and marks the fund ACHIEVED when
 * it reaches target. A no-op when no primary goal is designated.
 */
export async function syncPrimaryGoalProgress(): Promise<void> {
  const [primary] = await goalRepo.findMany({ isPrimary: true }, { take: 1 })
  if (!primary) return
  const g = primary as GoalRow

  const year = g.deadline.getFullYear()
  const [agg, paymentsAgg] = await Promise.all([
    // Monthly contributions in the fund's year...
    db.contribution.aggregate({ where: { periodYear: year }, _sum: { amountPaid: true } }),
    // ...plus any directed extra payments members made to the primary fund.
    goalRepo.sumSuccessfulPayments(g.id),
  ])
  const pooled = roundZAR(Number(agg._sum.amountPaid ?? 0) + Number(paymentsAgg._sum.amount ?? 0))

  if (roundZAR(Number(g.currentAmount)) === pooled) return

  const reachedTarget = pooled >= Number(g.targetAmount) && g.status === 'ACTIVE'
  await goalRepo.update(g.id, {
    currentAmount: pooled,
    ...(reachedTarget && { status: 'ACHIEVED' }),
  })
  await evictGoalsCache()

  if (reachedTarget) await emitGoalAchieved(g.id, g.title)
}

/**
 * Keep an additional (non-primary) goal's total in step with the money actually
 * behind it: admin-recorded progress plus settled directed payments.
 *
 * Like the primary fund, the figure is DERIVED rather than accumulated. That is
 * what makes it reversal-safe — a reversed payment leaves the SUCCESS sum, so
 * the next sync simply reflects the smaller total. Incrementing could only ever
 * go up, which left a reversed payment funding a goal forever.
 *
 * The ACHIEVED transition stays one-way on purpose. A goal that reached its
 * target and was celebrated is not un-celebrated because a single payment later
 * bounced; the total corrects, the milestone stands.
 */
export async function syncAdditionalGoalProgress(goalId: string): Promise<void> {
  const goal = await goalRepo.findById(goalId)
  if (!goal) return
  const g = goal as GoalRow
  if (g.isPrimary) return

  const [progressAgg, paymentsAgg] = await Promise.all([
    goalRepo.sumProgress(goalId),
    goalRepo.sumSuccessfulPayments(goalId),
  ])
  const funded = roundZAR(
    Number(progressAgg._sum.amount ?? 0) + Number(paymentsAgg._sum.amount ?? 0),
  )

  if (roundZAR(Number(g.currentAmount)) === funded) return

  const reachedTarget = funded >= Number(g.targetAmount) && g.status === 'ACTIVE'
  await goalRepo.update(goalId, {
    currentAmount: funded,
    ...(reachedTarget && { status: 'ACHIEVED' }),
  })
  await evictGoalsCache()

  if (reachedTarget) await emitGoalAchieved(goalId, g.title)
}

// ─── Member proposals ─────────────────────────────────────────────────────────

/**
 * A member proposes a Goal.
 *
 * The guide's six-step flow opens with "1 A member proposes it — with a clear
 * purpose and an amount", then "2 Leadership reviews it". Only leadership could
 * create a Goal, so the flow began with something a member could not do.
 *
 * Almost nothing new was needed. `DRAFT` already means "proposed but not
 * approved" and `activateGoal` already means "leadership approved"; what was
 * missing was a door a member could walk through. This is that door, and it is
 * deliberately the *same* `DRAFT` state the admin path creates — one review
 * queue, not two.
 *
 * `createGoal` is left exactly as it was. It is the leadership path and still
 * asserts admin.
 *
 * A proposal is told apart from a leadership draft by the roles of
 * `createdById`, not by a separate column — the existing relation already
 * carries who, which is what leadership needs to see.
 */
export async function proposeGoal(
  input: CreateGoalInput,
  userId: string,
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
    createdById: userId,
  })

  await writeAuditLog({
    userId,
    action: 'GOAL_PROPOSED',
    entity: 'Goal',
    entityId: goal.id,
    payload: { title: input.title, targetAmount: input.targetAmount, type: input.type },
    ipAddress: ip,
  })

  // Leadership has to know there is something to review, or step 2 never
  // happens and the member is left waiting on a queue nobody is watching.
  // Best-effort: a proposal that was recorded must not be lost because an
  // inbox write failed.
  await notifyAdmins({
    title: 'A member has proposed a Goal',
    body:
      `A new Goal has been proposed for review: "${input.title}", ` +
      `target ${formatProposalAmount(input.targetAmount)}. ` +
      `Open Goals in the console to approve or decline it.`,
    category: 'GOAL',
  }).catch((err) => logger.error('Failed to notify leadership of a goal proposal', {
    goalId: goal.id,
    error: err instanceof Error ? err.message : String(err),
  }))

  await evictGoalsCache()

  return serializeGoal(goal as GoalRow)
}

/** Rands, plainly, for a message body. */
function formatProposalAmount(amount: number): string {
  return `R${amount.toLocaleString('en-ZA')}`
}

// ─── Admin mutations ──────────────────────────────────────────────────────────

export async function createGoal(
  input: CreateGoalInput,
  adminUserId: string,
  roles: string[],
  ip: string,
) {
  assertAdmin(roles)

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
  roles: string[],
  ip: string,
) {
  assertAdmin(roles)

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

export async function deleteGoal(id: string, adminUserId: string, roles: string[], ip: string) {
  assertAdmin(roles)

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

export async function activateGoal(id: string, adminUserId: string, roles: string[], ip: string) {
  assertAdmin(roles)

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

export async function lockGoal(id: string, adminUserId: string, roles: string[], ip: string) {
  assertAdmin(roles)

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

export async function setPrimaryGoal(id: string, adminUserId: string, roles: string[], ip: string) {
  assertAdmin(roles)

  const existing = await goalRepo.findById(id)
  if (!existing) throw new GoalNotFoundError()

  const g = existing as GoalRow
  if (g.status !== 'ACTIVE') {
    throw new GoalConflictError('Only an active goal can be set as the primary fund', 'GOL_010')
  }
  if (g.isPrimary) {
    return serializeGoal(g)
  }

  await runTransaction(async (tx) => {
    // At most one primary (partial unique index) — demote the current one first.
    await goalRepo.updateGoalInTx({ isPrimary: true }, { isPrimary: false }, tx)
    await goalRepo.updateGoalInTx({ id }, { isPrimary: true }, tx)
  })

  await Promise.all([
    writeAuditLog({
      userId: adminUserId,
      action: 'GOAL_SET_PRIMARY',
      entity: 'Goal',
      entityId: id,
      payload: { title: g.title },
      ipAddress: ip,
    }),
    evictGoalsCache(),
  ])

  return serializeGoal({ ...g, isPrimary: true })
}

// ─── Progress recording ───────────────────────────────────────────────────────

export async function recordProgress(
  goalId: string,
  input: RecordProgressInput,
  adminUserId: string,
  roles: string[],
  ip: string,
) {
  assertAdmin(roles)

  const existing = await goalRepo.findById(goalId)
  if (!existing) throw new GoalNotFoundError()

  const g = existing as GoalRow
  if (g.status !== 'ACTIVE') {
    throw new GoalConflictError(
      'Progress can only be recorded on ACTIVE goals',
      'GOL_009',
    )
  }
  if (g.isPrimary) {
    throw new GoalConflictError(
      'The primary fund fills automatically from contributions and cannot be adjusted manually',
      'GOL_011',
    )
  }

  const newTotal = sumZAR(Number(g.currentAmount), input.amount)

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

  const achieved = newTotal >= Number(g.targetAmount)
  if (achieved) await emitGoalAchieved(goalId, g.title)

  return {
    id: progress.id,
    amount: Number(progress.amount),
    recordedAt: progress.recordedAt.toISOString(),
    newTotal,
    achieved,
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

/** A goal that just lapsed, and the members who had pledged toward it. */
export type FailedGoal = {
  id: string
  title: string
  pledgerIds: string[]
}

export async function markExpiredGoalsFailed(): Promise<FailedGoal[]> {
  const now = new Date()

  // Read the set before the write. `updateMany` returns nothing but a count,
  // and once the status has moved the deadline filter no longer matches these
  // rows — so after the update there is no way back to *which* goals lapsed.
  // The circle cannot be told about a goal nobody can name.
  const expiring = (await goalRepo.findMany(
    { status: 'ACTIVE', deadline: { lt: now } },
    { select: { id: true, title: true, pledges: { select: { userId: true } } } },
  )) as unknown as Array<{ id: string; title: string; pledges: { userId: string }[] }>

  if (expiring.length === 0) return []

  await goalRepo.updateMany(
    { id: { in: expiring.map((g) => g.id) }, status: 'ACTIVE' },
    { status: 'FAILED' },
  )

  return expiring.map((g) => ({
    id: g.id,
    title: g.title,
    // One member may hold only one pledge per goal (the [goalId, userId]
    // unique), but de-duplicating costs nothing and a repeated message about
    // money not being taken would be its own small unkindness.
    pledgerIds: [...new Set(g.pledges.map((p) => p.userId))],
  }))
}
