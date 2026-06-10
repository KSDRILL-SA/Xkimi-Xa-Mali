import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getOverrideHistory } from '@/services/budget.service'
import { withApiHandler } from '@/lib/api-handler'

export const GET = withApiHandler(async () => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const overrides = await getOverrideHistory(session.user.id, session.user.id, session.user.roles ?? [])
  return apiSuccess(overrides)
})
