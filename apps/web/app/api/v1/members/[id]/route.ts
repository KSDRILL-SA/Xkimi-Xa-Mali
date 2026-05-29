import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { UpdateProfileSchema } from '@/lib/validation/profile'
import { apiSuccess, apiError, handleServiceError } from '@/lib/api-response'
import { getMemberProfile, updateMemberProfile } from '@/services/member.service'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { id } = await params

  try {
    const profile = await getMemberProfile(id, session.user.id, session.user.roles)
    return apiSuccess(profile)
  } catch (err) {
    return handleServiceError(err)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
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
  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0].message, 400)

  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'

  try {
    const updated = await updateMemberProfile(id, session.user.id, session.user.roles, parsed.data, ip)
    return apiSuccess(updated)
  } catch (err) {
    return handleServiceError(err)
  }
}
