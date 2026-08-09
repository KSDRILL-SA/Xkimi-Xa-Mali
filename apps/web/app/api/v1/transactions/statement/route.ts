import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { statementRatelimit } from '@/lib/redis'
import { apiError } from '@/lib/api-response'
import { StatementRequestSchema } from '@/lib/validation/report'
import { generateMemberStatementPdf } from '@/services/report.service'
import { withApiHandler } from '@/lib/api-handler'
import { MONTHS } from '@/lib/date'

export const GET = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { success } = await statementRatelimit.limit(session.user.id)
  if (!success) return apiError('SYS_005', 'Statement download limit reached. Please try again later.', 429)

  const { searchParams } = new URL(req.url)
  const roles = (session.user.roles as string[] | undefined) ?? []

  const targetUserId = roles.includes('ADMIN') && searchParams.get('userId')
    ? (searchParams.get('userId') as string)
    : session.user.id

  const parsed = StatementRequestSchema.safeParse({
    month: Number(searchParams.get('month')),
    year: Number(searchParams.get('year')),
  })

  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0]?.message ?? 'Invalid request', 400)

  const { month, year } = parsed.data
  const monthName = MONTHS?.[month - 1] ?? `Month-${month}`
  const filename  = `xkimm-xa-mali-statement-${monthName.toLowerCase()}-${year}.pdf`

  // Streamed through this route, always. Never redirected to blob storage.
  //
  // The statement used to be uploaded to Vercel Blob with `access: 'public'`
  // and `addRandomSuffix: false`, at the path
  // `statements/<userId>/<year>-<month>.pdf`, and this route redirected to it.
  // Three things follow from that, and the third is the serious one:
  //
  //  - the URL is unauthenticated. Whoever holds it can fetch the document, and
  //    it was handed to the browser's history, to any proxy in the way, and to
  //    anyone the member ever forwarded the link to.
  //  - it is permanent. Nothing expires, and `getDownloadUrl` only adds a
  //    download disposition — calling its result `signedUrl` was wrong, because
  //    nothing about it was signed or time-limited.
  //  - the path is entirely derivable. With no random suffix, knowing a member's
  //    id yields every monthly statement they have ever generated, and the store
  //    hostname is already public in the CSP. A financial document listing
  //    contribution history and a masked account number was one guessed cuid
  //    away from anybody, with no session, no rate limit and no audit trail.
  //
  // Streaming costs a re-render of the PDF on each download. That is a few
  // hundred milliseconds against a statement request that is rate-limited to ten
  // an hour, and it puts every fetch behind `auth()`, `assertCanAccess` and this
  // limiter — which is where a document like this belongs.
  const buffer = await generateMemberStatementPdf(
    targetUserId,
    session.user.id,
    roles,
    month,
    year,
  )

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length':      String(buffer.byteLength),
      // Never a shared cache: this is one member's financial statement.
      'Cache-Control':       'private, no-store',
    },
  })
})
