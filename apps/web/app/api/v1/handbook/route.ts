import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-response'
import { generateLeadershipHandbookPdf } from '@/lib/pdf/leadership-handbook'
import { withApiHandler } from '@/lib/api-handler'

/**
 * The Leadership Handbook, for the people who run the Foundation.
 *
 * Gated on the ADMIN role rather than the founder badge, which is the opposite
 * choice from the Founder Guide beside it — and deliberately so. The guide is
 * issued to the founding members because of who they are; this describes work,
 * and it belongs to whoever is doing that work. A founder who holds no admin
 * role has nothing to carry out; an admin who is not a founder has all of it.
 *
 * Rendered per request for the same reason as the guide: a stored copy is a
 * copy that can go out of date, and this one quotes the same figures the
 * system enforces.
 */
export const GET = withApiHandler(async () => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) {
    return apiError(
      'SYS_003',
      'The Leadership Handbook is for members who administer the Foundation. The Founder Guide covers everything a member needs.',
      403,
    )
  }

  const holder = session.user.name ?? 'The Leadership'
  const buffer = await generateLeadershipHandbookPdf({ holder })

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': 'attachment; filename="Xkimm-Xa-Mali-Leadership-Handbook.pdf"',
      'Content-Length':      String(buffer.byteLength),
      'Cache-Control':       'private, no-store',
    },
  })
})
