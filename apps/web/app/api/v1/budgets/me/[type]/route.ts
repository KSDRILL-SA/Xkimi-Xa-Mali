import { NextRequest } from 'next/server'
import type { BudgetType } from '@prisma/client'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { updateBudgetAmount, deactivateBudget } from '@/services/budget.service'
import { UpdateBudgetAmountSchema } from '@/lib/validation/budget'
import { withApiHandler } from '@/lib/api-handler'

const VALID_TYPES = ['MONTHLY', 'YEARLY', 'CUSTOM']

export const PATCH = withApiHandler<{ type: string }>(async (req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { type } = await params
  if (!VALID_TYPES.includes(type)) return apiError('VAL_001', 'Invalid budget type', 422)

  const body = await req.json().catch(() => null)
  const parsed = UpdateBudgetAmountSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_001', parsed.error.errors[0]?.message ?? 'Invalid request', 422)
  }

  const budget = await updateBudgetAmount(
    session.user.id,
    session.user.id,
    session.user.roles ?? [],
    type as BudgetType,
    parsed.data.amount,
  )
  return apiSuccess(budget)
})

export const DELETE = withApiHandler<{ type: string }>(async (_req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { type } = await params
  if (!VALID_TYPES.includes(type)) return apiError('VAL_001', 'Invalid budget type', 422)

  await deactivateBudget(session.user.id, session.user.id, session.user.roles ?? [], type as BudgetType)
  return apiSuccess({ deactivated: true })
})
