import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { ChangePasswordSchema } from '@/lib/validation/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { changePassword } from '@/services/auth.service'
import { withApiHandler } from '@/lib/api-handler'

export const PATCH = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('SYS_001', 'Invalid request body', 400)
  }

  const parsed = ChangePasswordSchema.safeParse(body)
  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0].message, 400)

  const ip = req.headers.get('x-forwarded-for') ?? 'unknown'

  await changePassword(session.user.id, parsed.data.currentPassword, parsed.data.newPassword, ip)
  return apiSuccess({ message: 'Password changed successfully.' })
})
