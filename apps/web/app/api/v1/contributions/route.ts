import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getContributions } from '@/services/contribution.service'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return apiError('SYS_001', 'Authentication required', 401)

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') ?? session.user.id
  const page = Math.max(1, Number(searchParams.get('page') ?? '1'))
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') ?? '12')))

  try {
    const result = await getContributions(userId, session.user.id, session.user.roles ?? [], page, limit)
    return apiSuccess(result.items, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    })
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string; status?: number }
    return apiError(e.code ?? 'SYS_500', e.message ?? 'Server error', e.status ?? 500)
  }
}
