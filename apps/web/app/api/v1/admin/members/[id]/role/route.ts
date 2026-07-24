import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { setMemberRole } from '@/services/invite.service'
import { withApiHandler } from '@/lib/api-handler'
import { getClientIP } from '@/lib/request'

export const POST = withApiHandler<{ id: string }>(async (req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  const { id } = await params

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const b = body as Record<string, unknown>
  if (b.role !== 'ADMIN' && b.role !== 'MEMBER')
    return apiError('VAL_002', '"role" must be ADMIN or MEMBER', 400)
  if (typeof b.assign !== 'boolean')
    return apiError('VAL_003', '"assign" must be a boolean', 400)

  const ip = getClientIP(req)

  const result = await setMemberRole(session.user.id, roles, id, b.role, b.assign, ip)
  return apiSuccess(result)
})
