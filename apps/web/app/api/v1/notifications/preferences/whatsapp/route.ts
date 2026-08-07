import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { withApiHandler } from '@/lib/api-handler'
import { getWhatsappPreference, setWhatsappPreference } from '@/services/member.service'

export const GET = withApiHandler(async () => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  return apiSuccess(await getWhatsappPreference(session.user.id))
})

export const PATCH = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('VAL_001', 'Invalid JSON', 400)
  }

  if (typeof (body as Record<string, unknown>).enabled !== 'boolean') {
    return apiError('VAL_002', '"enabled" must be a boolean', 400)
  }

  const enabled = (body as { enabled: boolean }).enabled
  return apiSuccess(await setWhatsappPreference(session.user.id, enabled))
})
