import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { AdminReportRequestSchema } from '@/lib/validation/report'
import { getAdminReport } from '@/services/report.service'
import { withApiHandler } from '@/lib/api-handler'

export const GET = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)

  const { searchParams } = new URL(req.url)

  const parsed = AdminReportRequestSchema.safeParse({
    month: Number(searchParams.get('month')),
    year: Number(searchParams.get('year')),
  })

  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0]?.message ?? 'Invalid request', 400)

  const report = await getAdminReport(parsed.data.month, parsed.data.year)
  return apiSuccess(report)
})
