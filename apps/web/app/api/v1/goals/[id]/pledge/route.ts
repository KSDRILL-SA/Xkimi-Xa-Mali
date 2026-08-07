import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { setGoalPledge, cancelGoalPledge } from '@/services/goal-engagement.service'
import { withApiHandler } from '@/lib/api-handler'

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
  const amount = Number((body as { amount?: unknown }).amount)
  if (!Number.isFinite(amount)) return apiError('VAL_002', 'A valid amount is required', 400)

  const { id } = await params
  const summary = await setGoalPledge(id, session.user.id, amount, roles)
  return apiSuccess(summary)
})

export const DELETE = withApiHandler<{ id: string }>(async (_req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params
  const summary = await cancelGoalPledge(id, session.user.id)
  return apiSuccess(summary)
})
