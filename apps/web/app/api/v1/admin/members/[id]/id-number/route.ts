import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { correctMemberIdNumber } from '@/services/admin.service'
import { withApiHandler } from '@/lib/api-handler'
import { isValidInternalRequest, resolveInternalAdmin } from '@/lib/internal-request'
import { getClientIP } from '@/lib/request'

/**
 * Correcting the ID number held against a member.
 *
 * Reasoned, on the same standard as a reversal or a suspension: an identity
 * record that changes without saying why is worth less than one that never
 * changed. Before this route existed there was no way to change it at all.
 */
const CorrectIdSchema = z.object({
  idNumber: z.string().trim().regex(/^\d{13}$/, 'An SA ID number is 13 digits'),
  reason: z.string().trim().min(10, 'A reason of at least 10 characters is required').max(500),
})

export const POST = withApiHandler<{ id: string }>(async (req: NextRequest, { params }) => {
  // Two callers, two trust models — the shape the reversal route established.
  const isTrustedInternal = isValidInternalRequest(req)

  const session = await auth()
  const sessionRoles = (session?.user?.roles as string[] | undefined) ?? []

  let adminId: string
  let adminRoles: string[]

  if (isTrustedInternal) {
    const forwarded = await resolveInternalAdmin(req)
    if (!forwarded) {
      return apiError('VAL_004', 'A trusted correction must name a current admin', 400)
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

  const parsed = CorrectIdSchema.safeParse(body)
  if (!parsed.success) {
    return apiError('VAL_002', parsed.error.issues[0]?.message ?? 'Invalid payload', 400)
  }

  const { id } = await params
  const ip = (isTrustedInternal ? req.headers.get('x-admin-ip') : null) ?? getClientIP(req)

  return apiSuccess(
    await correctMemberIdNumber(adminId, adminRoles, id, parsed.data.idNumber, parsed.data.reason, ip),
  )
})
