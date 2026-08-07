import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getDashboardStats } from '@/services/admin.service'
import { withApiHandler } from '@/lib/api-handler'

export const GET = withApiHandler(async (_req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = session.user.roles as string[] | undefined
  if (!roles?.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)

  const stats = await getDashboardStats(roles)
  return apiSuccess(stats)
})
