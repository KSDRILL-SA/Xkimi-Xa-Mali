import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { withApiHandler } from '@/lib/api-handler'
import { getMemberNotifications } from '@/services/notification.service'

type NotifChannel = 'SMS' | 'EMAIL' | 'PUSH' | 'WHATSAPP'
type NotifStatus = 'QUEUED' | 'SENT' | 'FAILED'

const PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

const VALID_CHANNELS: NotifChannel[] = ['SMS', 'EMAIL', 'PUSH', 'WHATSAPP']
const VALID_STATUSES: NotifStatus[] = ['QUEUED', 'SENT', 'FAILED']

export const GET = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor') ?? undefined
  const rawLimit = parseInt(searchParams.get('limit') ?? String(PAGE_SIZE), 10)
  const limit = Math.min(isNaN(rawLimit) ? PAGE_SIZE : rawLimit, MAX_PAGE_SIZE)
  const channel = searchParams.get('channel') as NotifChannel | null
  const status = searchParams.get('status') as NotifStatus | null

  const { items, total, nextCursor } = await getMemberNotifications(session.user.id, {
    ...(channel && VALID_CHANNELS.includes(channel) && { channel }),
    ...(status && VALID_STATUSES.includes(status) && { status }),
    cursor,
    limit,
  })

  return apiSuccess({
    items: items.map((n) => ({
      id: n.id,
      channel: n.channel,
      status: n.status,
      slug: n.template.slug,
      sentAt: n.sentAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
    })),
    nextCursor,
    total,
  })
})
