import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import {
  lockGoal,
  GoalNotFoundError,
  GoalConflictError,
  GoalForbiddenError,
} from '@/services/goal.service'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = session.user.roles as string[] | undefined
  if (!roles?.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)

  const { id } = await params
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  try {
    const goal = await lockGoal(id, session.user.id, ip)
    return apiSuccess(goal)
  } catch (err: unknown) {
    if (err instanceof GoalNotFoundError) return apiError(err.code, err.message, err.status)
    if (err instanceof GoalConflictError) return apiError(err.code, err.message, err.status)
    if (err instanceof GoalForbiddenError) return apiError(err.code, err.message, err.status)
    const e = err as { code?: string; message?: string; status?: number }
    return apiError(e.code ?? 'SYS_500', e.message ?? 'Server error', e.status ?? 500)
  }
}
