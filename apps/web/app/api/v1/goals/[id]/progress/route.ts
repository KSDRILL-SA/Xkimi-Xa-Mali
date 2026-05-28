import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { RecordProgressSchema } from '@/lib/validation/goal'
import {
  getGoalProgress,
  recordProgress,
  GoalNotFoundError,
  GoalConflictError,
} from '@/services/goal.service'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { searchParams } = new URL(req.url)
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? '20')))

  const { id } = await params
  try {
    const result = await getGoalProgress(id, page, limit)
    return apiSuccess(result.items, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    })
  } catch (err: unknown) {
    if (err instanceof GoalNotFoundError) return apiError(err.code, err.message, err.status)
    const e = err as { code?: string; message?: string; status?: number }
    return apiError(e.code ?? 'SYS_500', e.message ?? 'Server error', e.status ?? 500)
  }
}

export async function POST(
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

  const parsed = RecordProgressSchema.safeParse(body)
  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0].message, 400)

  const { id } = await params
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'
  try {
    const result = await recordProgress(id, parsed.data, session.user.id, ip)
    return apiSuccess(result, 201)
  } catch (err: unknown) {
    if (err instanceof GoalNotFoundError) return apiError(err.code, err.message, err.status)
    if (err instanceof GoalConflictError) return apiError(err.code, err.message, err.status)
    const e = err as { code?: string; message?: string; status?: number }
    return apiError(e.code ?? 'SYS_500', e.message ?? 'Server error', e.status ?? 500)
  }
}
