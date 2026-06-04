import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { statementRatelimit } from '@/lib/redis'
import { apiError } from '@/lib/api-response'
import { StatementRequestSchema } from '@/lib/validation/report'
import { generateMemberStatement } from '@/services/report.service'
import { withApiHandler } from '@/lib/api-handler'

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

  const { signedUrl } = await generateMemberStatement(
    targetUserId,
    session.user.id,
    roles,
    parsed.data.month,
    parsed.data.year,
  )
  return NextResponse.redirect(signedUrl, { status: 302 })
})
