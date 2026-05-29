import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError, handleServiceError } from '@/lib/api-response'
import { StatementRequestSchema } from '@/lib/validation/report'
import { generateMemberStatement } from '@/services/report.service'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

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

  try {
    const { signedUrl } = await generateMemberStatement(
      targetUserId,
      session.user.id,
      roles,
      parsed.data.month,
      parsed.data.year,
    )
    return NextResponse.redirect(signedUrl, { status: 302 })
  } catch (err: unknown) {
    return handleServiceError(err)
  }
}
