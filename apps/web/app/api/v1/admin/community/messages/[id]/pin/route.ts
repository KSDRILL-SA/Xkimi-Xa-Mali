import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { pinMessage } from '@/services/community.service'
import { PinMessageSchema } from '@/lib/validation/community'
import { withApiHandler } from '@/lib/api-handler'

export const PATCH = withApiHandler<{ id: string }>(async (req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('VAL_001', 'Invalid JSON', 400)
  }

  const parsed = PinMessageSchema.safeParse(body)
  if (!parsed.success) return apiError('VAL_001', parsed.error.errors[0]?.message ?? 'Invalid request', 422)

  const result = await pinMessage(id, parsed.data.isPinned, session.user.id, session.user.roles ?? [])
  return apiSuccess(result)
})
