import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError, handleServiceError } from '@/lib/api-response'
import { listMembers } from '@/services/admin.service'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? undefined
  const status = searchParams.get('status') as 'PENDING' | 'ACTIVE' | 'SUSPENDED' | undefined
  const page  = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))

  try {
    const result = await listMembers(roles, { search, status, page, limit })
    return apiSuccess(result.items, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    })
  } catch (e) {
    return handleServiceError(e)
  }
}
