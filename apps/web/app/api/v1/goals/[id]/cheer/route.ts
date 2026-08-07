import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { toggleGoalCheer } from '@/services/goal-engagement.service'
import { withApiHandler } from '@/lib/api-handler'

export const POST = withApiHandler<{ id: string }>(async (_req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  const { id } = await params

  const result = await toggleGoalCheer(id, session.user.id, roles)
  return apiSuccess(result)
})
