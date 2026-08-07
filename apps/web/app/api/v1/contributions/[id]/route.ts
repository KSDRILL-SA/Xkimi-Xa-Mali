import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getContribution } from '@/services/contribution.service'
import { withApiHandler } from '@/lib/api-handler'

export const GET = withApiHandler<{ id: string }>(async (_req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user) return apiError('SYS_001', 'Authentication required', 401)

  const { id } = await params

  const contribution = await getContribution(id, session.user.id, session.user.roles ?? [])
  return apiSuccess(contribution)
})
