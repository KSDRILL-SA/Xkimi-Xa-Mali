import type { BudgetType, UserBudget, BudgetOverride } from '@prisma/client'
import { Prisma } from '@prisma/client'
import { budgetRepo } from '@/repositories/budget.repository'
import { contributionRepo, runTransaction } from '@/repositories/contribution.repository'
import { assertCanAccess, assertAdmin } from '@/lib/authorization'
import { BudgetNotFoundError } from '@/lib/errors'
import { writeAuditLog } from './audit.service'
import type { CreateBudgetInput } from '@/lib/validation/budget'

// ─── Types ───────────────────────────────────────────────────────────────────

export type BudgetCheckResult =
  | { status: 'NO_BUDGET' }
  | { status: 'WITHIN_BUDGET'; remaining: number; wouldTotal: number }
  | {
      status: 'OVER_BUDGET'
      budget: number
      alreadyContributed: number
      remaining: number
      wouldTotal: number
      overage: number
    }

export type MandateBudgetCheck =
  | { warning: false }
  | { warning: true; budget: number; mandateAmount: number; overage: number }

// ─── Serializers ─────────────────────────────────────────────────────────────

function serializeBudget(budget: UserBudget) {
  return {
    id: budget.id,
    type: budget.type,
    amount: Number(budget.amount),
    startDate: budget.startDate.toISOString(),
    endDate: budget.endDate?.toISOString() ?? null,
    isActive: budget.isActive,
    createdAt: budget.createdAt.toISOString(),
    updatedAt: budget.updatedAt.toISOString(),
  }
}

function serializeOverride(override: BudgetOverride) {
  return {
    id: override.id,
    budgetId: override.budgetId,
    contributionId: override.contributionId,
    attemptedAmount: Number(override.attemptedAmount),
    budgetAmount: Number(override.budgetAmount),
    overageAmount: Number(override.overageAmount),
    reason: override.reason,
    createdAt: override.createdAt.toISOString(),
  }
}

// ─── Budget guard checks ─────────────────────────────────────────────────────

/** Check a prospective contribution against a member's active budget for the given type. */
export async function checkBudget(
  userId: string,
  amount: number,
  type: BudgetType = 'MONTHLY',
): Promise<BudgetCheckResult> {
  const budget = await budgetRepo.findActiveByType(userId, type)
  if (!budget) return { status: 'NO_BUDGET' }

  const budgetAmount = Number(budget.amount)
  const alreadyContributed = await contributionRepo.sumPaidInPeriod(userId, budget)
  const remaining = budgetAmount - alreadyContributed
  const wouldTotal = alreadyContributed + amount

  if (wouldTotal <= budgetAmount) {
    return { status: 'WITHIN_BUDGET', remaining, wouldTotal }
  }

  return {
    status: 'OVER_BUDGET',
    budget: budgetAmount,
    alreadyContributed,
    remaining,
    wouldTotal,
    overage: wouldTotal - budgetAmount,
  }
}

/** Record that a member chose to proceed with a contribution that exceeds their budget. */
export async function recordBudgetOverride(
  userId: string,
  budgetId: string,
  contributionId: string | null,
  amounts: { attemptedAmount: number; budgetAmount: number; overageAmount: number },
  reason?: string,
) {
  const override = await budgetRepo.createOverride({
    budgetId,
    userId,
    contributionId,
    attemptedAmount: amounts.attemptedAmount,
    budgetAmount: amounts.budgetAmount,
    overageAmount: amounts.overageAmount,
    reason: reason ?? null,
  })

  await writeAuditLog({
    userId,
    action: 'BUDGET_OVERRIDE_RECORDED',
    entity: 'BudgetOverride',
    entityId: override.id,
    payload: {
      budgetId,
      contributionId,
      ...amounts,
      reason: reason ?? null,
    } as Prisma.InputJsonValue,
  })

  return serializeOverride(override)
}

/** Warn (not block) if a proposed mandate amount would exceed the member's monthly budget. */
export async function checkMandateAgainstBudget(
  userId: string,
  mandateAmount: number,
): Promise<MandateBudgetCheck> {
  const budget = await budgetRepo.findActiveByType(userId, 'MONTHLY')
  if (!budget) return { warning: false }

  const budgetAmount = Number(budget.amount)
  if (mandateAmount <= budgetAmount) return { warning: false }

  return {
    warning: true,
    budget: budgetAmount,
    mandateAmount,
    overage: mandateAmount - budgetAmount,
  }
}

// ─── Budget management ────────────────────────────────────────────────────────

/** A member's own budgets (active and deactivated history). */
export async function getMyBudgets(userId: string, requesterId: string, roles: string[]) {
  assertCanAccess(userId, requesterId, roles)
  const budgets = await budgetRepo.findAllByUser(userId)
  return budgets.map(serializeBudget)
}

/** Create a new active budget for a type, replacing any existing active one. */
export async function createBudget(
  userId: string,
  requesterId: string,
  roles: string[],
  data: CreateBudgetInput,
) {
  assertCanAccess(userId, requesterId, roles)

  const existing = await budgetRepo.findActiveByType(userId, data.type)

  const budget = await runTransaction(async (tx) => {
    if (existing) await budgetRepo.deactivate(existing.id, tx)
    return budgetRepo.create(
      {
        userId,
        type: data.type,
        amount: data.amount,
        startDate: new Date(data.startDate),
        endDate: data.endDate ? new Date(data.endDate) : null,
        isActive: true,
      },
      tx,
    )
  })

  await writeAuditLog({
    userId,
    action: 'BUDGET_CREATED',
    entity: 'UserBudget',
    entityId: budget.id,
    payload: { type: data.type, amount: data.amount } as Prisma.InputJsonValue,
  })

  return serializeBudget(budget)
}

/** Update the amount of a member's active budget for a type. */
export async function updateBudgetAmount(
  userId: string,
  requesterId: string,
  roles: string[],
  type: BudgetType,
  amount: number,
) {
  assertCanAccess(userId, requesterId, roles)

  const existing = await budgetRepo.findActiveByType(userId, type)
  if (!existing) throw new BudgetNotFoundError()

  const budget = await runTransaction(async (tx) => {
    await budgetRepo.deactivate(existing.id, tx)
    return budgetRepo.create(
      {
        userId,
        type,
        amount,
        startDate: existing.startDate,
        endDate: existing.endDate,
        isActive: true,
      },
      tx,
    )
  })

  await writeAuditLog({
    userId,
    action: 'BUDGET_UPDATED',
    entity: 'UserBudget',
    entityId: budget.id,
    payload: { type, amount, previousAmount: Number(existing.amount) } as Prisma.InputJsonValue,
  })

  return serializeBudget(budget)
}

/** Deactivate a member's budget guard for a type. */
export async function deactivateBudget(
  userId: string,
  requesterId: string,
  roles: string[],
  type: BudgetType,
) {
  assertCanAccess(userId, requesterId, roles)

  const existing = await budgetRepo.findActiveByType(userId, type)
  if (!existing) throw new BudgetNotFoundError()

  await budgetRepo.deactivate(existing.id)

  await writeAuditLog({
    userId,
    action: 'BUDGET_DEACTIVATED',
    entity: 'UserBudget',
    entityId: existing.id,
    payload: { type } as Prisma.InputJsonValue,
  })
}

/** A member's budget override history, most recent first. */
export async function getOverrideHistory(userId: string, requesterId: string, roles: string[]) {
  assertCanAccess(userId, requesterId, roles)
  const overrides = await budgetRepo.findOverridesByUser(userId)
  return overrides.map(serializeOverride)
}

/** All members' active budgets with override counts (admin only). */
export async function getAllBudgetsAdmin(roles: string[]) {
  assertAdmin(roles)

  const [budgets, overrideCounts] = await Promise.all([
    budgetRepo.findAllActive(),
    budgetRepo.countOverridesByUser(),
  ])

  const countByUser = new Map(overrideCounts.map((c) => [c.userId, c._count.id]))

  return budgets.map((budget) => ({
    ...serializeBudget(budget),
    user: {
      id: budget.user.id,
      firstName: budget.user.firstName,
      lastName: budget.user.lastName,
      email: budget.user.email,
    },
    overrideCount: countByUser.get(budget.userId) ?? 0,
  }))
}
