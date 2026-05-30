import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError, handleServiceError } from '@/lib/api-response'
import { UpdateGoalSchema } from '@/lib/validation/goal'
import { getGoal, updateGoal, deleteGoal } from '@/services/goal.service'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params
  try {
    const goal = await getGoal(id)
    return apiSuccess(goal)
  } catch (err) {
    return handleServiceError(err)
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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
  try {
    const goal = await updateGoal(id, parsed.data, session.user.id, ip)
    return apiSuccess(goal)
  } catch (err) {
    return handleServiceError(err)
  }
}

export async function DELETE(
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
    await deleteGoal(id, session.user.id, ip)
    return apiSuccess({ deleted: true })
  } catch (err) {
    return handleServiceError(err)
  }
}
