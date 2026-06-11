import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getInbox } from '@/services/inbox.service'
import { withApiHandler } from '@/lib/api-handler'

export const GET = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor') ?? undefined
  const unreadOnly = searchParams.get('unread') === '1'

  const result = await getInbox(session.user.id, { cursor, unreadOnly })
  return apiSuccess(result)
})
