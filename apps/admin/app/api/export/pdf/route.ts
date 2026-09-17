import { NextRequest, NextResponse } from 'next/server'
import { writeAuditLog } from '@/lib/services/shared'
import { adminExportRatelimit } from '@/lib/rate-limit'
import { clientIpFromHeaders } from '@xxm/utils/client-ip'
import { auth } from '@/lib/auth'
import { WEB_BASE_URL } from '@/lib/env'

/**
 * Rendering a PDF and forwarding it through this proxy is slower than an
 * ordinary request, and this route chains two serverless functions — this
 * one waits on the web app's, so it needs at least as much room. Left at the
 * platform default (10s on most plans), a real render past that point was
 * killed mid-flight and the admin saw a raw platform timeout body instead of
 * a PDF. Vercel clamps this to whatever the plan actually allows, so setting
 * it higher than necessary here is safe.
 */
export const maxDuration = 60

/**
 * What actually failed, in words an admin can act on.
 *
 * The raw response body was being handed straight to the browser: our own
 * API envelope's JSON on an ordinary failure, or a platform timeout body
 * (also JSON-shaped) when the render ran past the function's time limit.
 * Either way, clicking "Download PDF" and getting a JSON blob on screen told
 * an admin nothing about what to do next.
 */
function friendlyExportError(detail: string, status: number): string {
  if (status === 504 || /timeout/i.test(detail)) {
    return 'The report took too long to generate and the request timed out. Please try again — if it keeps happening, try a smaller period.'
  }
  try {
    const parsed = JSON.parse(detail) as { error?: { message?: string } }
    if (parsed?.error?.message) return parsed.error.message
  } catch {
    // Not JSON — fall through to the generic message below.
  }
  return 'The report could not be generated. Please try again.'
}

/**
 * Streams the monthly contribution report PDF.
 *
 * The PDF is rendered by the web app's trusted admin endpoint, which requires
 * the shared internal secret — a header the browser can't attach. So we proxy
 * it server-side here: verify the admin session, then fetch the web endpoint
 * with the secret and stream the bytes straight back to the browser.
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  const roles   = (session?.user?.roles as string[] | undefined) ?? []
  if (!session?.user?.id || !roles.includes('ADMIN')) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const month = parseInt(searchParams.get('month') ?? '', 10)
  const year  = parseInt(searchParams.get('year') ?? '', 10)
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2024) {
    return new NextResponse('Missing or invalid month or year', { status: 400 })
  }

  const { success } = await adminExportRatelimit.limit(session.user.id)
  if (!success) {
    return new NextResponse('Export limit reached. Please try again later.', { status: 429 })
  }

  // The same record the CSV route writes, for the same reason: this is a copy
  // of the membership's personal information leaving the system, and until now
  // nothing said who took it. Written before the fetch, so an entry exists even
  // if the report service is the thing that fails.
  await writeAuditLog({
    userId: session.user.id,
    action: 'ADMIN_CONTRIBUTIONS_EXPORTED',
    entity: 'Contribution',
    entityId: `${year}-${String(month).padStart(2, '0')}`,
    payload: { month, year, format: 'pdf' },
    ipAddress: clientIpFromHeaders(req.headers) ?? 'unknown',
  })

  const base   = WEB_BASE_URL
  const secret = process.env['ADMIN_API_SECRET']
  if (!secret) {
    return new NextResponse('Report service is not configured (ADMIN_API_SECRET missing).', { status: 500 })
  }

  let res: Response
  try {
    res = await fetch(`${base}/api/v1/admin/reports/pdf?month=${month}&year=${year}`, {
      headers: {
        'x-admin-secret':    secret,
        'x-admin-timestamp': String(Date.now()),
        'x-admin-user-id':   session.user.id,
      },
      cache: 'no-store',
    })
  } catch {
    return new NextResponse('Could not reach the report service. Please try again.', { status: 502 })
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    return new NextResponse(friendlyExportError(detail, res.status), { status: res.status })
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  const filename = `xkimi-xa-mali-report-${year}-${String(month).padStart(2, '0')}.pdf`

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
