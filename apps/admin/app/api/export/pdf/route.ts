import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

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

  const base   = process.env['WEB_INTERNAL_URL'] ?? process.env['NEXTAUTH_URL'] ?? 'http://localhost:3000'
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
    return new NextResponse(detail || 'The report could not be generated.', { status: res.status })
  }

  const buffer = Buffer.from(await res.arrayBuffer())
  const filename = `xkimm-xa-mali-report-${year}-${String(month).padStart(2, '0')}.pdf`

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
