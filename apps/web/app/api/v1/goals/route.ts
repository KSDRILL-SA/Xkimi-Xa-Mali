import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { CreateGoalSchema } from '@/lib/validation/goal'
import { getGoals, createGoal } from '@/services/goal.service'
import { withApiHandler } from '@/lib/api-handler'

export const GET = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') as 'DRAFT' | 'ACTIVE' | 'ACHIEVED' | 'FAILED' | null
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? '20')))

  const validStatuses = ['DRAFT', 'ACTIVE', 'ACHIEVED', 'FAILED']
  const statusFilter = status && validStatuses.includes(status) ? status : undefined
  const roles = (session.user.roles as string[] | undefined) ?? []

  const result = await getGoals(statusFilter, page, limit, roles)
  return apiSuccess(result.items, 200, {
    page: result.page,
    limit: result.limit,
    total: result.total,
    totalPages: result.totalPages,
  })
})

export const POST = withApiHandler(async (req: NextRequest) => {
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

  const parsed = CreateGoalSchema.safeParse(body)
  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0].message, 400)

  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  const goal = await createGoal(parsed.data, session.user.id, ip)
  return apiSuccess(goal, 201)
})
