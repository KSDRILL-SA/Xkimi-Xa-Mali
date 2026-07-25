import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { RecordProgressSchema } from '@/lib/validation/goal'
import { getGoal, getGoalProgress, recordProgress } from '@/services/goal.service'
import { withApiHandler } from '@/lib/api-handler'
import { getClientIP } from '@/lib/request'

export const GET = withApiHandler<{ id: string }>(async (
  req: NextRequest,
  { params },
) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  const { id } = await params

  // Check the goal exists and is visible to this user before returning progress
  const goal = await getGoal(id)
  if (goal.status === 'DRAFT' && !roles.includes('ADMIN')) {
    return apiError('ADM_001', 'Goal not found', 404)
  }

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '20')))

  const result = await getGoalProgress(id, page, limit)
  return apiSuccess(result.items, 200, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  })
})

export const POST = withApiHandler<{ id: string }>(async (
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

  const parsed = RecordProgressSchema.safeParse(body)
  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0]?.message ?? 'Invalid request', 400)

  const { id } = await params
  const ip = getClientIP(req) ?? 'unknown'
  const result = await recordProgress(id, parsed.data, session.user.id, roles ?? [], ip)
  return apiSuccess(result, 201)
})
