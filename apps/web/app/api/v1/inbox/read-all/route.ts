import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { markAllInboxRead } from '@/services/inbox.service'
import { withApiHandler } from '@/lib/api-handler'

export const POST = withApiHandler(async () => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const marked = await markAllInboxRead(session.user.id)
  return apiSuccess({ marked })
})
