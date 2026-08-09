import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { CreateGoalSchema } from '@/lib/validation/goal'
import { getGoals, createGoal } from '@/services/goal.service'
import { withApiHandler } from '@/lib/api-handler'
import { getClientIP } from '@/lib/request'

export const GET = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') as 'DRAFT' | 'ACTIVE' | 'ACHIEVED' | 'FAILED' | null
  // Math.max(1, NaN) is NaN, so ?page=abc reached Prisma as skip: NaN and
  // ?limit=abc as take: NaN — a 500 for a mistyped URL. The third page in this
  // app with that shape; see the transactions history for the other two.
  const rawPage = Number(searchParams.get('page') ?? '1')
  const rawLimit = Number(searchParams.get('limit') ?? '20')
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.floor(rawLimit))) : 20

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
  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0]?.message ?? 'Invalid request', 400)

  const ip = getClientIP(req) ?? 'unknown'
  const goal = await createGoal(parsed.data, session.user.id, roles ?? [], ip)
  return apiSuccess(goal, 201)
})
