import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError, handleServiceError } from '@/lib/api-response'
import { AdminReportRequestSchema } from '@/lib/validation/report'
import { exportAdminReportCSV } from '@/services/report.service'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)

  const { searchParams } = new URL(req.url)

  const parsed = AdminReportRequestSchema.safeParse({
    month: Number(searchParams.get('month')),
    year: Number(searchParams.get('year')),
  })

  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0].message, 400)

  try {
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
  } catch (err: unknown) {
    return handleServiceError(err)
  }
}
