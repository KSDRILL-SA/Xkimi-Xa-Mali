import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError } from '@/lib/api-response'
import { exportMemberData } from '@/services/member.service'
import { withApiHandler } from '@/lib/api-handler'

export const GET = withApiHandler<{ id: string }>(async (_req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params

  const data = await exportMemberData(id, session.user.id, session.user.roles)
  return new NextResponse(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="xxm-data-export-${id}.json"`,
    },
  })
})
