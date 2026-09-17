import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-response'
import { AdminReportRequestSchema } from '@/lib/validation/report'
import { generateContributionReportPdf } from '@/services/report.service'
import { withApiHandler } from '@/lib/api-handler'
import { verifyInternalRequest, resolveInternalAdmin } from '@/lib/internal-request'
import { getClientIP } from '@/lib/request'

/**
 * Rendering pulls every active member's contribution rows, optionally reads
 * and embeds a signature image from blob storage, and runs @react-pdf's own
 * layout pass — real work, not a lookup. Left at the platform default (10s on
 * most plans), a real render past that point was killed mid-flight, and the
 * admin console's proxy — which waits on this route — had nothing to forward
 * but a platform timeout body. Vercel clamps this to whatever the plan
 * actually allows, so setting it higher than necessary here is safe.
 */
export const maxDuration = 60

export const GET = withApiHandler(async (req: NextRequest) => {
  const isTrusted = await verifyInternalRequest(req)
  const session   = isTrusted ? null : await auth()
  if (!isTrusted && !session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = isTrusted ? ['ADMIN'] : (session?.user?.roles as string[] | undefined) ?? []
  if (!isTrusted && !roles.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)

  const actorId = isTrusted ? (await resolveInternalAdmin(req)) ?? undefined : session!.user.id

  const { searchParams } = new URL(req.url)
  const parsed = AdminReportRequestSchema.safeParse({
    month: Number(searchParams.get('month')),
    year: Number(searchParams.get('year')),
  })
  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0]?.message ?? 'Invalid request', 400)

  const { month, year } = parsed.data
  const buffer = await generateContributionReportPdf(roles, month, year, actorId, getClientIP(req) ?? undefined)
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
