import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { adminResendVerification } from '@/services/admin.service'
import { withApiHandler } from '@/lib/api-handler'
import { verifyInternalRequest, resolveInternalAdmin } from '@/lib/internal-request'
import { getClientIP } from '@/lib/request'

/**
 * Re-send a member's email verification link on an admin's say-so.
 *
 * Same dual-trust shape as the id-number correction route: the admin console
 * has no business holding the token store or the sending domain, so it asks
 * this app to act, and this app has to tell a browser session from the
 * console's own server-to-server call.
 */
export const POST = withApiHandler<{ id: string }>(async (req: NextRequest, { params }) => {
  const isTrustedInternal = await verifyInternalRequest(req)

  const session = await auth()
  const sessionRoles = (session?.user?.roles as string[] | undefined) ?? []

  let adminId: string
  let adminRoles: string[]

  if (isTrustedInternal) {
    const forwarded = await resolveInternalAdmin(req)
    if (!forwarded) {
      return apiError('VAL_004', 'A trusted resend must name a current admin', 400)
    }
    adminId = forwarded
    adminRoles = ['ADMIN']
  } else {
    if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)
    if (!sessionRoles.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)
    adminId = session.user.id
    adminRoles = sessionRoles
  }

  const { id } = await params
  const ip = (isTrustedInternal ? req.headers.get('x-admin-ip') : null) ?? getClientIP(req)
  const baseUrl = new URL(req.url).origin

  return apiSuccess(
    await adminResendVerification(adminId, adminRoles, id, baseUrl, ip),
  )
})
