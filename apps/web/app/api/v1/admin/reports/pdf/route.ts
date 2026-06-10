import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-response'
import { AdminReportRequestSchema } from '@/lib/validation/report'
import { generateContributionReportPdf } from '@/services/report.service'
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

  const { month, year } = parsed.data
  const buffer = await generateContributionReportPdf(roles, month, year)
  const filename = `xxm-contribution-report-${year}-${String(month).padStart(2, '0')}.pdf`

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String(buffer.byteLength),
      'Cache-Control':       'no-store',
    },
  })
})
