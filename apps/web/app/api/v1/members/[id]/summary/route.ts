import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getMemberSummary } from '@/services/member.service'
import { withApiHandler } from '@/lib/api-handler'

export const GET = withApiHandler<{ id: string }>(async (_req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params

  const summary = await getMemberSummary(id, session.user.id, session.user.roles)
  return apiSuccess(summary)
})
