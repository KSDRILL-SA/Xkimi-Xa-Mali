import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { UpdateProfileSchema } from '@/lib/validation/profile'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getMemberProfile, updateMemberProfile } from '@/services/member.service'
import { withApiHandler } from '@/lib/api-handler'
import { getClientIP } from '@/lib/request'

export const GET = withApiHandler<{ id: string }>(async (_req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params

  const profile = await getMemberProfile(id, session.user.id, session.user.roles)
  return apiSuccess(profile)
})

export const PATCH = withApiHandler<{ id: string }>(async (req: NextRequest, { params }) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('SYS_001', 'Invalid request body', 400)
  }

  const parsed = UpdateProfileSchema.safeParse(body)
  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0]?.message ?? 'Invalid request', 400)

  const ip = getClientIP(req) ?? 'unknown'

  const updated = await updateMemberProfile(id, session.user.id, session.user.roles, parsed.data, ip)
  return apiSuccess(updated)
})
