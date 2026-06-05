import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { UpdateGoalSchema } from '@/lib/validation/goal'
import { getGoal, updateGoal, deleteGoal } from '@/services/goal.service'
import { withApiHandler } from '@/lib/api-handler'

export const GET = withApiHandler<{ id: string }>(async (
  _req: NextRequest,
  { params },
) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params
  const goal = await getGoal(id)
  const roles = (session.user.roles as string[] | undefined) ?? []
  if (goal.status === 'DRAFT' && !roles.includes('ADMIN')) {
    return apiError('ADM_001', 'Goal not found', 404)
  }
  return apiSuccess(goal)
})

export const PATCH = withApiHandler<{ id: string }>(async (
  req: NextRequest,
  { params },
) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = session.user.roles as string[] | undefined
  if (!roles?.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('SYS_001', 'Invalid request body', 400)
  }

  const parsed = UpdateGoalSchema.safeParse(body)
  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0].message, 400)

  const { id } = await params
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const goal = await updateGoal(id, parsed.data, session.user.id, ip)
  return apiSuccess(goal)
})

export const DELETE = withApiHandler<{ id: string }>(async (
  req: NextRequest,
  { params },
) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = session.user.roles as string[] | undefined
  if (!roles?.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)

  const { id } = await params
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  await deleteGoal(id, session.user.id, ip)
  return apiSuccess({ deleted: true })
})
