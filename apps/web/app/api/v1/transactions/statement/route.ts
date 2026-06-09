import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { statementRatelimit } from '@/lib/redis'
import { apiError } from '@/lib/api-response'
import { StatementRequestSchema } from '@/lib/validation/report'
import {
  generateMemberStatement,
  generateMemberStatementPdf,
} from '@/services/report.service'
import { withApiHandler } from '@/lib/api-handler'
import { env } from '@/lib/env'
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

  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0].message, 400)

  const { month, year } = parsed.data
  const monthName = MONTHS?.[month - 1] ?? `Month-${month}`
  const filename  = `xkimm-xa-mali-statement-${monthName.toLowerCase()}-${year}.pdf`

  if (!env.BLOB_READ_WRITE_TOKEN) {
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
        'Cache-Control':       'no-store',
      },
    })
  }

  const { signedUrl } = await generateMemberStatement(
    targetUserId,
    session.user.id,
    roles,
    month,
    year,
  )
  return NextResponse.redirect(signedUrl, { status: 302 })
})
