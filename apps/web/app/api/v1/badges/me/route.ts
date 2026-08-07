import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getMyBadge } from '@/services/badge.service'
import { withApiHandler } from '@/lib/api-handler'

export const GET = withApiHandler(async (_req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const badge = await getMyBadge(session.user.id, session.user.id, session.user.roles ?? [])
  return apiSuccess(badge)
})
