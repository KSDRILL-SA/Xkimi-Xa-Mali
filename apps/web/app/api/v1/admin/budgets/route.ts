import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getAllBudgetsAdmin } from '@/services/budget.service'
import { withApiHandler } from '@/lib/api-handler'

export const GET = withApiHandler(async () => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const budgets = await getAllBudgetsAdmin(session.user.roles ?? [])
  return apiSuccess(budgets)
})
