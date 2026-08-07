import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getGoalEngagement, addGoalComment } from '@/services/goal-engagement.service'
import { withApiHandler } from '@/lib/api-handler'

export const GET = withApiHandler<{ id: string }>(async (_req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  const { id } = await params

  const engagement = await getGoalEngagement(id, session.user.id, roles)
  return apiSuccess(engagement)
})

export const POST = withApiHandler<{ id: string }>(async (req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('SYS_001', 'Invalid request body', 400)
  }
  const content = (body as { content?: unknown }).content
  if (typeof content !== 'string') return apiError('VAL_002', '"content" is required', 400)

  const { id } = await params
  const comment = await addGoalComment(id, session.user.id, content, roles)
  return apiSuccess(comment, 201)
})
