import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { UpdateGoalSchema } from '@/lib/validation/goal'
import { getGoal, updateGoal, deleteGoal } from '@/services/goal.service'
import { withApiHandler } from '@/lib/api-handler'
import { getClientIP } from '@/lib/request'

export const GET = withApiHandler<{ id: string }>(async (
  _req: NextRequest,
  { params },
) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params
  const roles = (session.user.roles as string[] | undefined) ?? []

  // `roles` passed, not re-checked afterwards.
  //
  // This route used to call `getGoal(id)` and then apply its own draft rule.
  // The rule was correct and unreachable: `getGoal` defaults `roles` to `[]`
  // and throws GoalNotFoundError for a draft before returning, so the branch
  // below it never ran — and an admin who could see a draft in the list got
  // "not found" when they opened it.
  //
  // The same rule in two places, with the copy on the path being the one that
  // did not know about admins. One rule, one place.
  const goal = await getGoal(id, roles)
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
  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0]?.message ?? 'Invalid request', 400)

  const { id } = await params
  const ip = getClientIP(req) ?? 'unknown'
  const goal = await updateGoal(id, parsed.data, session.user.id, roles ?? [], ip)
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
  const ip = getClientIP(req) ?? 'unknown'
  await deleteGoal(id, session.user.id, roles ?? [], ip)
  return apiSuccess({ deleted: true })
})
