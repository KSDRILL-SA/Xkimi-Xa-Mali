import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { MessageSquare, Mail, Bell, type LucideIcon } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'

export const metadata: Metadata = { title: 'Notifications' }

type NotifChannel = 'SMS' | 'EMAIL' | 'PUSH'
type NotifStatus = 'QUEUED' | 'SENT' | 'FAILED'

type NotificationItem = {
  id: string
  channel: string
  status: string
  sentAt: Date | null
  createdAt: Date
  template: { slug: string }
}

const PAGE_SIZE = 30

const CHANNEL_LABELS: Record<NotifChannel, string> = {
  SMS: 'SMS',
  EMAIL: 'Email',
  PUSH: 'Push',
}

const CHANNEL_ICONS: Record<NotifChannel, LucideIcon> = {
  SMS:   MessageSquare,
  EMAIL: Mail,
  PUSH:  Bell,
}

const STATUS_CONFIG: Record<NotifStatus, { label: string; className: string }> = {
  QUEUED: { label: 'Queued', className: 'xxm-status-info'    },
  SENT:   { label: 'Sent',   className: 'xxm-status-success' },
  FAILED: { label: 'Failed', className: 'xxm-status-danger'  },
}

function slugToTitle(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatRelative(date: Date): string {
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)

  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`

  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; channel?: string; status?: string }>
}) {
  const session = await auth()
  const userId = session!.user.id
  const params = await searchParams
  const cursor = params.cursor
  const channelFilter = params.channel as NotifChannel | undefined
  const statusFilter = params.status as NotifStatus | undefined

  const validChannels: NotifChannel[] = ['SMS', 'EMAIL', 'PUSH']
  const validStatuses: NotifStatus[] = ['QUEUED', 'SENT', 'FAILED']

  const channelWhere = channelFilter && validChannels.includes(channelFilter) ? channelFilter : undefined
  const statusWhere = statusFilter && validStatuses.includes(statusFilter) ? statusFilter : undefined

  const [notifications, total, failedCount] = await Promise.all([
    db.notification.findMany({
      where: {
        userId,
        ...(channelWhere && { channel: channelWhere }),
        ...(statusWhere && { status: statusWhere }),
      },
      take: PAGE_SIZE + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        channel: true,
        status: true,
        sentAt: true,
        createdAt: true,
        template: { select: { slug: true } },
      },
    }),
    db.notification.count({ where: { userId } }),
    db.notification.count({ where: { userId, status: 'FAILED' } }),
  ])

  const hasNextPage = notifications.length > PAGE_SIZE
  const items = hasNextPage ? notifications.slice(0, PAGE_SIZE) : notifications
  const nextCursor = hasNextPage ? items[items.length - 1]?.id : null

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = {
      cursor: cursor,
      channel: channelFilter,
      status: statusFilter,
      ...overrides,
    }
    Object.entries(merged).forEach(([k, v]) => {
      if (v) p.set(k, v)
    })
    const qs = p.toString()
    return `/dashboard/notifications${qs ? `?${qs}` : ''}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Notifications"
        subtitle={`${total} notification${total !== 1 ? 's' : ''} total${failedCount > 0 ? ` · ${failedCount} failed` : ''}`}
        action={
          <Link
            href="/dashboard/profile"
            className="text-sm text-xxm-green-700 hover:text-xxm-green-900 underline underline-offset-2"
          >
            Manage preferences
          </Link>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <FilterChip label="All" href={buildUrl({ channel: undefined, cursor: undefined }) as Route} active={!channelFilter} />
        {validChannels.map((ch) => (
          <FilterChip
            key={ch}
            label={CHANNEL_LABELS[ch]}
            href={buildUrl({ channel: ch, cursor: undefined }) as Route}
            active={channelFilter === ch}
          />
        ))}
        <div className="w-px bg-xxm-gray-200 mx-1" />
        <FilterChip label="All status" href={buildUrl({ status: undefined, cursor: undefined }) as Route} active={!statusFilter} />
        {validStatuses.map((s) => (
          <FilterChip
            key={s}
            label={STATUS_CONFIG[s].label}
            href={buildUrl({ status: s, cursor: undefined }) as Route}
            active={statusFilter === s}
          />
        ))}
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="xxm-card p-10 text-center">
          <p className="text-gray-400 text-sm">No notifications yet.</p>
          <p className="text-gray-400 text-xs mt-1">
            Delivery confirmations, payment alerts, and reminders will appear here.
          </p>
        </div>
      ) : (
        <div className="xxm-card divide-y divide-xxm-gray-100">
          {(items as NotificationItem[]).map((n) => {
            const cfg = STATUS_CONFIG[n.status as NotifStatus] ?? STATUS_CONFIG.QUEUED
            const date = n.sentAt ?? n.createdAt
            const ChannelIcon = CHANNEL_ICONS[n.channel as NotifChannel] ?? Bell
            return (
              <div key={n.id} className="flex items-start gap-4 px-5 py-4 hover:bg-xxm-green-50/20 transition-colors">
                <div className="mt-0.5 w-8 h-8 rounded-full bg-xxm-green-50 flex items-center justify-center shrink-0" aria-hidden>
                  <ChannelIcon size={15} className="text-xxm-green" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-xxm-gray-800 truncate">
                    {slugToTitle(n.template.slug)}
                  </p>
                  <p className="text-xs text-xxm-gray-400 mt-0.5">
                    {CHANNEL_LABELS[n.channel as NotifChannel] ?? n.channel} · {formatRelative(date)}
                  </p>
                </div>
                <span className={`shrink-0 ${cfg.className}`} role="status">{cfg.label}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {(nextCursor || cursor) && (
        <div className="flex justify-between">
          {cursor ? (
            <Link
              href={buildUrl({ cursor: undefined }) as Route}
              className="text-sm text-xxm-green-700 hover:text-xxm-green-900 underline"
            >
              ← Back to latest
            </Link>
          ) : (
            <span />
          )}
          {nextCursor && (
            <Link
              href={buildUrl({ cursor: nextCursor }) as Route}
              className="text-sm text-xxm-green-700 hover:text-xxm-green-900 underline"
            >
              Load older →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function FilterChip({
  label,
  href,
  active,
}: {
  label: string
  href: Route
  active: boolean
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active
          ? 'bg-xxm-green text-white'
          : 'bg-xxm-gray-100 text-xxm-gray-600 hover:bg-xxm-gray-200'
      }`}
    >
      {label}
    </Link>
  )
}
