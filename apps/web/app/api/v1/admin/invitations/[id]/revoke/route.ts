import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { revokeInvitation } from '@/services/invite.service'
import { withApiHandler } from '@/lib/api-handler'

export const POST = withApiHandler<{ id: string }>(async (req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  const { id } = await params
  const ip = req.headers.get('x-forwarded-for') ?? undefined

  await revokeInvitation(session.user.id, roles, id, ip)
  return apiSuccess({ revoked: true })
})
