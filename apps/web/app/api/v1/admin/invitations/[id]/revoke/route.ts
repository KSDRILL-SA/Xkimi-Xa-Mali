import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import {
  revokeInvitation,
  InviteForbiddenError, InviteNotFoundError,
  InviteUsedError, InviteRevokedError,
} from '@/services/invite.service'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const roles = (session.user.roles as string[] | undefined) ?? []
  const { id } = await params
  const ip = req.headers.get('x-forwarded-for') ?? undefined

  try {
    await revokeInvitation(session.user.id, roles, id, ip)
    return apiSuccess({ revoked: true })
  } catch (e) {
    if (e instanceof InviteForbiddenError) return apiError(e.code, e.message, 403)
    if (e instanceof InviteNotFoundError)  return apiError(e.code, e.message, 404)
    if (e instanceof InviteUsedError)      return apiError(e.code, e.message, 409)
    if (e instanceof InviteRevokedError)   return apiError(e.code, e.message, 409)
    throw e
  }
}
