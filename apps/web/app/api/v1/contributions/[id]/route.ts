import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError, handleServiceError } from '@/lib/api-response'
import { getContribution } from '@/services/contribution.service'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return apiError('SYS_001', 'Authentication required', 401)

  const { id } = await params

  try {
    const contribution = await getContribution(id, session.user.id, session.user.roles ?? [])
    return apiSuccess(contribution)
  } catch (err: unknown) {
    return handleServiceError(err)
  }
}
