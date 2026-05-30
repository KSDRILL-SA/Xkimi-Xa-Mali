import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { apiSuccess, apiError } from '@/lib/api-response'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const [user, pref] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: { phone: true },
    }),
    db.notificationPreference.findUnique({
      where: { userId: session.user.id },
      select: { whatsapp: true },
    }),
  ])

  return apiSuccess({ enabled: pref?.whatsapp ?? true, phone: user?.phone ?? null })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError('VAL_001', 'Invalid JSON', 400)
  }

  if (typeof (body as Record<string, unknown>).enabled !== 'boolean') {
    return apiError('VAL_002', '"enabled" must be a boolean', 400)
  }

  const enabled = (body as { enabled: boolean }).enabled

  const pref = await db.notificationPreference.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, sms: true, email: true, push: true, whatsapp: enabled },
    update: { whatsapp: enabled },
    select: { whatsapp: true },
  })

  await db.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'WHATSAPP_PREFERENCE_UPDATED',
      entity: 'NotificationPreference',
      entityId: session.user.id,
      payload: { enabled },
    },
  })

  return apiSuccess({ enabled: pref.whatsapp })
}
