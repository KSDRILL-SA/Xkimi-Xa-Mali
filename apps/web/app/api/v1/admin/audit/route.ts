import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { listAuditLogs, AdminForbiddenError } from '@/services/admin.service'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []

  const { searchParams } = new URL(req.url)
  const entity = searchParams.get('entity') ?? undefined
  const action = searchParams.get('action') ?? undefined
  const userId = searchParams.get('userId') ?? undefined
  const page   = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10))
  const limit  = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '30', 10)))

  try {
    const result = await listAuditLogs(roles, { entity, action, userId, page, limit })
    return apiSuccess(result.items, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    })
  } catch (e) {
    if (e instanceof AdminForbiddenError) return apiError(e.code, e.message, 403)
    throw e
  }
}
