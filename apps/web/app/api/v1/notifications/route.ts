import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { apiSuccess, apiError } from '@/lib/api-response'
import { withApiHandler } from '@/lib/api-handler'

type NotifChannel = 'SMS' | 'EMAIL' | 'PUSH' | 'WHATSAPP'
type NotifStatus = 'QUEUED' | 'SENT' | 'FAILED'

type NotificationRow = {
  id: string
  channel: string
  status: string
  sentAt: Date | null
  createdAt: Date
  template: { slug: string }
}

const PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100

export const GET = withApiHandler(async (req: NextRequest) => {
  const session = await auth()
  if (!session?.user?.id) return apiError('SYS_002', 'Unauthorised', 401)

  const { searchParams } = new URL(req.url)
  const cursor = searchParams.get('cursor') ?? undefined
  const rawLimit = parseInt(searchParams.get('limit') ?? String(PAGE_SIZE), 10)
  const limit = Math.min(isNaN(rawLimit) ? PAGE_SIZE : rawLimit, MAX_PAGE_SIZE)
  const channel = searchParams.get('channel') as NotifChannel | null
  const status = searchParams.get('status') as NotifStatus | null

  const validChannels: NotifChannel[] = ['SMS', 'EMAIL', 'PUSH', 'WHATSAPP']
  const validStatuses: NotifStatus[] = ['QUEUED', 'SENT', 'FAILED']

  const channelFilter = channel && validChannels.includes(channel) ? channel : undefined
  const statusFilter = status && validStatuses.includes(status) ? status : undefined

  const [notifications, total] = await Promise.all([
    db.notification.findMany({
      where: {
        userId: session.user.id,
        ...(channelFilter && { channel: channelFilter }),
        ...(statusFilter && { status: statusFilter }),
      },
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        channel: true,
        status: true,
        sentAt: true,
        createdAt: true,
        template: {
          select: { slug: true },
        },
      },
    }),
    db.notification.count({
      where: {
        userId: session.user.id,
        ...(channelFilter && { channel: channelFilter }),
        ...(statusFilter && { status: statusFilter }),
      },
    }),
  ])

  const hasNextPage = notifications.length > limit
  const items = hasNextPage ? notifications.slice(0, limit) : notifications
  const nextCursor = hasNextPage ? items[items.length - 1]?.id : null

  return apiSuccess({
    items: (items as NotificationRow[]).map((n) => ({
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
