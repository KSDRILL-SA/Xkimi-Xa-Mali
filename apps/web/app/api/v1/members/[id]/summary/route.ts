import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getMemberSummary } from '@/services/member.service'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params

  try {
    const summary = await getMemberSummary(id, session.user.id, session.user.roles)
    return apiSuccess(summary)
  } catch (err) {
    const e = err as { code?: string; message: string }
    if (e.code === 'SYS_003') return apiError('SYS_003', e.message, 403)
    if (e.code === 'MBR_001') return apiError('MBR_001', e.message, 404)
    return apiError('SYS_004', 'Something went wrong', 500)
  }
}
