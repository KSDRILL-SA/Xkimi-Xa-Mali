import { goalPlanRepo, goalRepo, mandateRepo } from '@/repositories'
import { assertCanAccess } from '@/lib/authorization'
import { GoalNotFoundError, GoalConflictError, MandateConflictError } from '@/lib/errors'
import { roundZAR, subtractZAR } from '@/lib/money'
import { writeAuditLog } from '@/services/audit.service'
import { MIN_GOAL_PAYMENT } from '@/lib/validation/goal'
import { logger } from '@xxm/observability'
import { queueNotification } from '@/services/notification.service'
import { payToGoal } from '@/services/goal-payment.service'
import { isDueOn, periodKey, instalmentFor } from '@/lib/goal-plan-schedule'

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

  // `currentAmount` is the materialised figure, not the derived one.
  //
  // Deliberate, and bounded. Under the contract in `applySettledPayment`, a
  // goal's total is DERIVED from its settled payments and `currentAmount` is a
  // cache the next sync corrects — so between a payment and its sync this can
  // be briefly high, and the suggestion briefly low.
  //
  // Acceptable *here specifically* because a suggestion is not a commitment:
  // the member sees it, changes it if they like, and what they choose is what
  // gets stored. Nothing collects on this number.
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

// ─── Collection ─────────────────────────────────────────────────────────────

/**
 * Collect every plan that is due today.
 *
 * Called by a daily job. The work is here rather than in the job so it can be
 * driven directly in a test without an Inngest runtime.
 *
 * Nothing about a plan is trusted at collection time. The goal may have been
 * met, achieved, or passed its deadline since the member set the plan up, and
 * the mandate they had may be gone. Each is a reason to stop rather than a
 * reason to charge.
 */
/**
 * The failure bookkeeping, with its result actually checked.
 *
 * ── Why these are functions rather than three inline calls ─────────────────
 *
 * `collectDuePlans` claims a plan with `updateByVersion(plan.id, plan.version,
 * …)` and checks the count — correct, and that claim is what stops two runs
 * collecting the same plan. Its three follow-up writes then used
 * `plan.version + 1` and **discarded the result**.
 *
 * That assumed the claim was the only thing to touch the row in between. A
 * member resuming or cancelling their plan mid-run moves the version again, the
 * follow-up matches nothing, affects zero rows, and is silently dropped.
 *
 * What gets dropped is `failedRuns` — the counter that pauses a plan which
 * keeps failing and tells the member why. So a plan could fail repeatedly, lose
 * the increment each time to a race, and never pause: the one outcome the
 * counter exists to produce.
 *
 * It is narrow and unlikely. It is also a silent write, and a silent write on
 * the money path is the thing this repository keeps finding. Logging the loss
 * costs nothing and turns "it never paused" into something with a trail.
 */
async function recordFailure(plan: { id: string; version: number; failedRuns: number }): Promise<void> {
  const updated = await goalPlanRepo.updateByVersion(plan.id, plan.version + 1, {
    failedRuns: plan.failedRuns + 1,
  })

  if (updated.count === 0) {
    // The member changed the plan while this run was collecting on it. The
    // charge stands; only the tally was lost.
    logger.warn('Goal plan failure count not recorded — the plan changed mid-run', {
      planId: plan.id, expectedVersion: plan.version + 1,
    })
  }
}

/** The mirror of {@link recordFailure}: a plan that recovered starts clean. */
async function clearFailures(plan: { id: string; version: number }): Promise<void> {
  const updated = await goalPlanRepo.updateByVersion(plan.id, plan.version + 1, { failedRuns: 0 })

  if (updated.count === 0) {
    logger.warn('Goal plan failure count not cleared — the plan changed mid-run', {
      planId: plan.id, expectedVersion: plan.version + 1,
    })
  }
}

export async function collectDuePlans(now = new Date()): Promise<{
  collected: number
  failed: number
  completed: number
  paused: number
}> {
  const candidates = await goalPlanRepo.findDueCandidates(now.getDate())
  let collected = 0
  let failed = 0
  let completed = 0
  let paused = 0

  for (const plan of candidates) {
    if (!isDueOn(plan, now)) continue

    const goal = plan.goal
    // The same materialised figure, and here it does decide money — it caps the
    // instalment so a plan cannot overshoot its goal.
    //
    // Acceptable because of when this runs, not because the figure is exact.
    // The job is a daily cron; a settlement re-syncs the goal at the moment it
    // settles, so by the time this reads it the cache has been correct for
    // hours. The failure mode is also the safe direction: a stale-high total
    // makes `remaining` too small and collects less, never more.
    //
    // If this ever moves to running immediately after settlement, derive here.
    const remaining = Math.max(0, subtractZAR(Number(goal.targetAmount), Number(goal.currentAmount)))

    // Reasons to stop rather than collect. Checked in this order because a met
    // goal is good news and an expired one is not, and the member is told
    // different things about each.
    const stop =
      goal.status !== 'ACTIVE' ? 'The goal is no longer active'
      // Plain apostrophe, not a right single quote. This string is dropped
      // into an SMS body, and a single character outside GSM-7 bills the whole
      // message as UCS-2 — halving the character budget for every plan that
      // ends this way.
      : goal.deadline.getTime() <= now.getTime() ? "The goal's deadline passed"
      : remaining <= 0 ? 'The goal reached its target'
      : null

    if (stop) {
      const ended = await goalPlanRepo.updateByVersion(plan.id, plan.version, {
        status: 'COMPLETED', endedAt: now, endedReason: stop,
      })
      if (ended.count > 0) {
        completed += 1
        await queueNotification({
          userId: plan.userId,
          templateSlug: 'goal-plan-completed',
          channel: 'SMS',
          // `goal`, not `goalTitle` — the name every other goal template uses.
          payload: { goal: goal.title, reason: stop },
        }).catch(() => {})
      }
      continue
    }

    // The debit order may have been revoked since. Pausing keeps the plan so
    // the member can resume it, rather than throwing away what they set up.
    const mandate = await mandateRepo.findActiveByUser(plan.userId)
    if (!mandate?.netcashMandateId) {
      const stopped = await goalPlanRepo.updateByVersion(plan.id, plan.version, {
        status: 'PAUSED', endedReason: 'No active debit order to collect from',
      })
      if (stopped.count > 0) {
        paused += 1
        await queueNotification({
          userId: plan.userId,
          templateSlug: 'goal-plan-paused',
          channel: 'SMS',
          payload: { goal: goal.title },
        }).catch(() => {})
      }
      continue
    }

    const period = periodKey(now)
    const amount = instalmentFor(Number(plan.amount), remaining)
    if (amount === null) continue // covered by `stop` above; belt and braces

    // Stamped before the charge, not after. A job that dies mid-collection must
    // not leave the plan looking un-collected — the idempotency key below is
    // what makes the charge itself safe, and this stops a same-day rerun from
    // even reaching the gateway.
    const claimed = await goalPlanRepo.updateByVersion(plan.id, plan.version, {
      lastCollectedPeriod: period,
    })
    if (claimed.count === 0) continue // another run took it, or the member cancelled

    try {
      // The member is both subject and requester: this is their own standing
      // instruction being carried out, not an admin acting on their behalf.
      const res = await payToGoal(
        plan.goalId, plan.userId, plan.userId, [], amount, undefined,
        `plan:${plan.id}:${period}`,
      )

      if (res.status === 'FAILED') {
        failed += 1
        await recordFailure(plan)
      } else {
        collected += 1
        if (plan.failedRuns > 0) await clearFailures(plan)
      }
    } catch (err) {
      failed += 1
      logger.error('Goal plan collection failed', {
        planId: plan.id, goalId: plan.goalId, userId: plan.userId,
        error: err instanceof Error ? err.message : String(err),
      })
      await recordFailure(plan)
    }
  }

  return { collected, failed, completed, paused }
}

/**
 * Restart a plan that stopped without the member choosing to stop it.
 *
 * The collection job pauses a plan itself when the debit order behind it has
 * gone, and until now there was no way back — the member replaced their mandate
 * and the plan stayed paused for good, silently, with nothing to click.
 *
 * Only PAUSED comes back. CANCELLED and COMPLETED are terminal by intent: one
 * is the member's decision and the other is a goal that is finished, and
 * reviving either would take money nobody asked for.
 */
export async function resumePlan(
  planId: string,
  userId: string,
  requesterId: string,
  roles: string[],
  ip?: string,
) {
  assertCanAccess(userId, requesterId, roles)

  const plan = await goalPlanRepo.findById(planId)
  if (!plan || plan.userId !== userId) throw new GoalNotFoundError()
  if (plan.status !== 'PAUSED') {
    throw new GoalConflictError('Only a paused plan can be resumed', 'GPL_008')
  }

  // Is there already a live plan for this goal?
  //
  // The database knows: `goal_plans_user_goal_active_key` is unique on
  // (userId, goalId) among ACTIVE rows, so two active plans for one goal cannot
  // exist. That partial index has been quietly absorbing this — a paused plan
  // resumed alongside a newer active one was refused by Postgres.
  //
  // Refused, and reported as a raw constraint violation: an opaque error, from
  // a function that returns a clear message for every other refusal it makes.
  // The invariant was safe and the member was not told why.
  //
  // Worth noting which way round this runs. Everywhere else in this audit the
  // application held a rule the database did not; here the database held one
  // the application had forgotten. The index did its job. This just says so in
  // words a person can act on.
  const live = await goalPlanRepo.findActive(userId, plan.goalId)
  if (live && live.id !== plan.id) {
    throw new GoalConflictError(
      'You already have an active plan for this goal. Cancel that one first if you want to go back to this.',
      'GPL_010',
    )
  }

  // Whatever paused it must be fixed first, or the next collection pauses it
  // straight back and the member learns nothing from having pressed the button.
  const mandate = await mandateRepo.findActiveByUser(userId)
  if (!mandate?.netcashMandateId) {
    throw new MandateConflictError(
      'An active debit order is required before you can resume a plan',
      'CTR_002',
    )
  }

  const goal = (await goalRepo.findById(plan.goalId)) as GoalForPlan | null
  if (!goal) throw new GoalNotFoundError()
  if (goal.status !== 'ACTIVE' || goal.deadline.getTime() <= Date.now()) {
    throw new GoalConflictError(
      'This goal is no longer open, so the plan cannot be resumed',
      'GPL_009',
    )
  }

  const updated = await goalPlanRepo.updateByVersion(planId, plan.version, {
    status: 'ACTIVE',
    // The pause reason is cleared: it described a state that no longer holds,
    // and leaving it would show a live plan explaining why it had stopped.
    endedReason: null,
    failedRuns: 0,
  })
  if (updated.count === 0) {
    throw new GoalConflictError('This plan was just changed. Refresh and try again.', 'GPL_007')
  }

  await writeAuditLog({
    userId: requesterId,
    action: 'GOAL_PLAN_RESUMED',
    entity: 'GoalPlan',
    entityId: planId,
    payload: { goalId: plan.goalId },
    ipAddress: ip,
  })

  return { resumed: true as const }
}
