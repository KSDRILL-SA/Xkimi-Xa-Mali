import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { apiError, handleServiceError } from '@/lib/api-response'
import { exportMemberData } from '@/services/member.service'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params

  try {
    const data = await exportMemberData(id, session.user.id, session.user.roles)
    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="xxm-data-export-${id}.json"`,
      },
    })
  } catch (err) {
    return handleServiceError(err)
  }
}
