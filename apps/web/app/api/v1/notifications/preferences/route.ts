import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { NotificationPreferencesSchema } from '@/lib/validation/profile'
import { apiSuccess, apiError } from '@/lib/api-response'
import { getNotificationPreferences, updateNotificationPreferences } from '@/services/member.service'
import { withApiHandler } from '@/lib/api-handler'
import { getClientIP } from '@/lib/request'

export const GET = withApiHandler(async () => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const prefs = await getNotificationPreferences(session.user.id)
  return apiSuccess(prefs)
})

export const PATCH = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('SYS_001', 'Invalid request body', 400)
  }

  const parsed = NotificationPreferencesSchema.safeParse(body)
  if (!parsed.success) return apiError('SYS_001', parsed.error.errors[0]?.message ?? 'Invalid request', 400)

  const ip = getClientIP(req) ?? 'unknown'
  const prefs = await updateNotificationPreferences(session.user.id, parsed.data, ip)
  return apiSuccess(prefs)
})
