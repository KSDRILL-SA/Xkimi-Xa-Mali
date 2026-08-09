import { goalPlanRepo, goalRepo, mandateRepo } from '@/repositories'
import { assertCanAccess } from '@/lib/authorization'
import { GoalNotFoundError, GoalConflictError, MandateConflictError } from '@/lib/errors'
import { roundZAR, subtractZAR } from '@/lib/money'
import { writeAuditLog } from '@/services/audit.service'
import { MIN_GOAL_PAYMENT } from '@/lib/validation/goal'
import { logger } from '@xxm/observability'

/**
 * Standing commitments to fund a goal every month.
 *
 * A member who would rather commit than remember sets an amount and a day, and
 * the collection job charges it against the debit order they already hold.
 * There is no mandate per plan on purpose: a member may hold only one active
 * mandate at a time, so per-goal mandates would mean a schema change and a
 * second Netcash registration for no gain.
 *
 * A plan is an instruction, never money. Every rand it moves is still written
 * as a GoalPayment, so a goal's derived total and its reversal behaviour are
 * exactly as they were before plans existed.
 */

type GoalForPlan = {
  id: string
  title: string
  targetAmount: unknown
  currentAmount: unknown
  deadline: Date
  status: string
}

/** Whole months from now until the deadline, at least one. */
export function monthsUntil(deadline: Date, now = new Date()): number {
  const months =
    (deadline.getFullYear() - now.getFullYear()) * 12 + (deadline.getMonth() - now.getMonth())
  return Math.max(1, months)
}

/**
 * What to suggest as a monthly amount, and the shape of the commitment.
 *
 * The suggestion is what is left over the months left — the member's own
 * description of the feature. It is a starting point, not a rule: the amount
 * they submit is theirs to choose, because someone who can afford less should
 * be able to join at less rather than be locked out of the goal entirely.
 */
export async function suggestPlan(goalId: string, userId: string, requesterId: string, roles: string[]) {
  assertCanAccess(userId, requesterId, roles)

  const goal = (await goalRepo.findById(goalId)) as GoalForPlan | null
  if (!goal) throw new GoalNotFoundError()

  const remaining = Math.max(0, subtractZAR(Number(goal.targetAmount), Number(goal.currentAmount)))
  const months = monthsUntil(goal.deadline)
  const suggested = Math.max(MIN_GOAL_PAYMENT, roundZAR(remaining / months))

  const [existing, committed] = await Promise.all([
    goalPlanRepo.findActive(userId, goalId),
    goalPlanRepo.sumActiveAmounts(userId),
  ])

  return {
    goalId: goal.id,
    goalTitle: goal.title,
    remaining,
    months,
    suggested,
    alreadyEnrolled: existing !== null,
    /** What this member is already committed to each month, before this plan. */
    committedMonthly: roundZAR(Number(committed._sum.amount ?? 0)),
  }
}

/**
 * Start a monthly commitment to a goal.
 *
 * The mandate is checked here rather than at the first collection so a member
 * cannot set up a plan that was never going to work — they would hear nothing
 * until a collection day weeks away failed silently.
 */
export async function enrolInPlan(
  goalId: string,
  userId: string,
  requesterId: string,
  roles: string[],
  rawAmount: number,
  debitDay: number,
  ip?: string,
) {
  assertCanAccess(userId, requesterId, roles)

  const amount = roundZAR(rawAmount)
  if (!(amount >= MIN_GOAL_PAYMENT)) {
    throw new GoalConflictError(
      `The minimum monthly amount for a plan is R${MIN_GOAL_PAYMENT}`,
      'GPL_001',
    )
  }
  if (!Number.isInteger(debitDay) || debitDay < 1 || debitDay > 31) {
    throw new GoalConflictError('Choose a day of the month between 1 and 31', 'GPL_002')
  }

  const goal = (await goalRepo.findById(goalId)) as GoalForPlan | null
  if (!goal) throw new GoalNotFoundError()
  if (goal.status !== 'ACTIVE') {
    throw new GoalConflictError('You can only set up a plan for an active goal', 'GPL_003')
  }
  if (goal.deadline.getTime() <= Date.now()) {
    throw new GoalConflictError('This goal’s deadline has passed', 'GPL_004')
  }

  // Same requirement the one-off goal payment has, asked at the right moment.
  const mandate = await mandateRepo.findActiveByUser(userId)
  if (!mandate?.netcashMandateId) {
    throw new MandateConflictError(
      'An active debit order is required before you can set up a plan',
      'CTR_002',
    )
  }

  const existing = await goalPlanRepo.findActive(userId, goalId)
  if (existing) {
    throw new GoalConflictError('You already have a plan running for this goal', 'GPL_005')
  }

  const plan = await goalPlanRepo.create({ userId, goalId, amount, debitDay })

  await writeAuditLog({
    userId: requesterId,
    action: 'GOAL_PLAN_STARTED',
    entity: 'GoalPlan',
    entityId: plan.id,
    payload: { goalId, goalTitle: goal.title, amount, debitDay },
    ipAddress: ip,
  })

  logger.info('Goal plan started', { userId, goalId, amount, debitDay })
  return plan
}

/** A member's plans, with the goal each one is funding. */
export async function getMyPlans(userId: string, requesterId: string, roles: string[]) {
  assertCanAccess(userId, requesterId, roles)
  const plans = await goalPlanRepo.findManyByUser(userId)
  return plans.map((p) => ({
    id: p.id,
    goalId: p.goalId,
    goalTitle: p.goal.title,
    amount: Number(p.amount),
    debitDay: p.debitDay,
    status: p.status,
    lastCollectedPeriod: p.lastCollectedPeriod,
    startedAt: p.startedAt.toISOString(),
    endedAt: p.endedAt?.toISOString() ?? null,
    endedReason: p.endedReason,
  }))
}

/**
 * Stop a plan.
 *
 * Terminal, and deliberately not a refund: money already collected belongs to
 * the goal. A member who wants to fund it again starts a new plan, which the
 * partial unique index allows precisely because this one is no longer ACTIVE.
 */
export async function cancelPlan(
  planId: string,
  userId: string,
  requesterId: string,
  roles: string[],
  ip?: string,
) {
  assertCanAccess(userId, requesterId, roles)

  const plan = await goalPlanRepo.findById(planId)
  if (!plan || plan.userId !== userId) throw new GoalNotFoundError()
  if (plan.status !== 'ACTIVE' && plan.status !== 'PAUSED') {
    throw new GoalConflictError('This plan has already ended', 'GPL_006')
  }

  const updated = await goalPlanRepo.updateByVersion(planId, plan.version, {
    status: 'CANCELLED',
    endedAt: new Date(),
    endedReason: 'Cancelled by member',
  })
  if (updated.count === 0) {
    // The collection job moved it while this request was in flight.
    throw new GoalConflictError('This plan was just changed. Refresh and try again.', 'GPL_007')
  }

  await writeAuditLog({
    userId: requesterId,
    action: 'GOAL_PLAN_CANCELLED',
    entity: 'GoalPlan',
    entityId: planId,
    payload: { goalId: plan.goalId },
    ipAddress: ip,
  })

  return { cancelled: true as const }
}
