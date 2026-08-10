import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { rejectMandate } from '@/services/admin.service'
import { withApiHandler } from '@/lib/api-handler'
import { isValidInternalRequest, resolveInternalAdmin } from '@/lib/internal-request'
import { getClientIP } from '@/lib/request'

/**
 * A rejection has to say why.
 *
 * The member is told, and the reason is kept. Before this the message said
 * their request "was not approved" and left it there — the same words whether
 * the account name did not match, the branch code was wrong, or leadership
 * simply had not met them yet. A member who cannot tell which of those it was
 * cannot fix it.
 */
const RejectSchema = z.object({
  reason: z.string().trim().min(10, 'A reason of at least 10 characters is required').max(500),
})

export const POST = withApiHandler<{ id: string }>(async (req: NextRequest, { params }) => {
  // Two callers, two trust models — the same shape the reversal route uses.
  //
  // The console has no session cookie for this app. It calls server-to-server
  // with the shared secret, and it must name the admin who acted, because a
  // rejection stops somebody's contributions and the audit trail should say
  // whose decision that was.
  const isTrustedInternal = isValidInternalRequest(req)

  const session = await auth()
  const sessionRoles = (session?.user?.roles as string[] | undefined) ?? []

  let adminId: string
  let adminRoles: string[]

  if (isTrustedInternal) {
    const forwarded = await resolveInternalAdmin(req)
    if (!forwarded) {
      return apiError('VAL_004', 'A trusted rejection must name a current admin', 400)
    }
    adminId = forwarded
    adminRoles = ['ADMIN']
  } else {
    if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)
    if (!sessionRoles.includes('ADMIN')) return apiError('SYS_003', 'Forbidden', 403)
    adminId = session.user.id
    adminRoles = sessionRoles
  }

  let body: unknown
  try { body = await req.json() } catch { return apiError('VAL_001', 'Invalid JSON', 400) }

  const parsed = RejectSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_002', parsed.error.issues[0]?.message ?? 'Invalid payload', 400)
  }

  const { id } = await params

  // On the trusted path the socket address belongs to the console, not to the
  // person who clicked.
  const ip = (isTrustedInternal ? req.headers.get('x-admin-ip') : null) ?? getClientIP(req)

  const updated = await rejectMandate(adminId, adminRoles, id, ip, parsed.data.reason)
  return apiSuccess(updated)
})
