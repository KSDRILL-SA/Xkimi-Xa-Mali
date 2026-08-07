import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getMyBudgets, createBudget } from '@/services/budget.service'
import { CreateBudgetSchema } from '@/lib/validation/budget'
import { withApiHandler } from '@/lib/api-handler'

export const GET = withApiHandler(async () => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const budgets = await getMyBudgets(session.user.id, session.user.id, session.user.roles ?? [])
  return apiSuccess(budgets)
})

export const POST = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const body = await req.json().catch(() => null)
  const parsed = CreateBudgetSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_001', parsed.error.errors[0]?.message ?? 'Invalid request', 422)
  }

  const budget = await createBudget(session.user.id, session.user.id, session.user.roles ?? [], parsed.data)
  return apiSuccess(budget, 201)
})
