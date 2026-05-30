import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError, handleServiceError } from '@/lib/api-response'
import { activateGoal } from '@/services/goal.service'

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
    const goal = await activateGoal(id, session.user.id, ip)
    return apiSuccess(goal)
  } catch (err) {
    return handleServiceError(err)
  }
}
