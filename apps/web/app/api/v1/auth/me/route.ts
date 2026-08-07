import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { withApiHandler } from '@/lib/api-handler'
import { getAuthenticatedUser } from '@/services/member.service'

export const GET = withApiHandler(async () => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const user = await getAuthenticatedUser(session.user.id)
  if (!user) return apiError('MBR_001', 'User not found', 404)

  return apiSuccess(user)
})
