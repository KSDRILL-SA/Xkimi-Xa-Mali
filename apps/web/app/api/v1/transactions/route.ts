import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { TransactionFilterSchema } from '@/lib/validation/report'
import { getTransactionHistory, ReportForbiddenError } from '@/services/report.service'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { searchParams } = new URL(req.url)
  const roles = (session.user.roles as string[] | undefined) ?? []

  // Admins may query any member; members can only query themselves
  const targetUserId = roles.includes('ADMIN') && searchParams.get('userId')
    ? (searchParams.get('userId') as string)
    : session.user.id

  const parsed = TransactionFilterSchema.safeParse({
    status: searchParams.get('status') ?? undefined,
    type: searchParams.get('type') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
    page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
    limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 20,
  })

  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0].message, 400)

  try {
    const result = await getTransactionHistory(targetUserId, session.user.id, roles, parsed.data)
    return apiSuccess(result.items, 200, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    })
  } catch (err: unknown) {
    if (err instanceof ReportForbiddenError) return apiError(err.code, err.message, err.status)
    const e = err as { code?: string; message?: string; status?: number }
    return apiError(e.code ?? 'SYS_500', e.message ?? 'Server error', e.status ?? 500)
  }
}
