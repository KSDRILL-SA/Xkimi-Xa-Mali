import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { withApiHandler } from '@/lib/api-handler'
import { getLockStatus } from '@/services/signature.service'

export const GET = withApiHandler(async () => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const status = await getLockStatus(session.user.id, session.user.roles ?? [])
  return apiSuccess(status)
})
