import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-response'
import { AdminReportRequestSchema } from '@/lib/validation/report'
import { exportAdminReportCSV } from '@/services/report.service'
import { withApiHandler } from '@/lib/api-handler'

const MAX_TS_DRIFT_MS = 5 * 60 * 1000

function isValidInternalRequest(req: NextRequest): boolean {
  const expected = process.env.ADMIN_API_SECRET
  if (!expected) return false
  if (req.headers.get('x-admin-secret') !== expected) return false
  const ts = req.headers.get('x-admin-timestamp')
  if (!ts) return false
  return Math.abs(Date.now() - Number(ts)) <= MAX_TS_DRIFT_MS
}

export const GET = withApiHandler(async (req: NextRequest) => {
  const isTrusted = isValidInternalRequest(req)
  const session   = isTrusted ? null : await auth()
  if (!isTrusted && !session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = isTrusted ? ['ADMIN'] : (session?.user?.roles as string[] | undefined) ?? []
  if (!isTrusted && !roles.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)

  const { searchParams } = new URL(req.url)

  const parsed = AdminReportRequestSchema.safeParse({
    month: Number(searchParams.get('month')),
    year: Number(searchParams.get('year')),
  })

  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0].message, 400)

  const csv = await exportAdminReportCSV(parsed.data.month, parsed.data.year)
  const filename = `xxm-report-${parsed.data.year}-${String(parsed.data.month).padStart(2, '0')}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
})
