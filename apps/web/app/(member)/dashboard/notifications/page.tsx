import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getMemberNotifications } from '@/services/notification.service'
import { Reveal } from '@xxm/ui'
import { MessageSquare, Mail, Bell, type LucideIcon } from 'lucide-react'

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

const STATUS_CONFIG: Record<NotifStatus, { label: string; dot: string; badge: string }> = {
  QUEUED: { label: 'Queued', dot: 'bg-sky-500',      badge: 'bg-sky-100 text-sky-700'   },
  SENT:   { label: 'Sent',   dot: 'bg-xxm-green',    badge: 'bg-xxm-green-100 text-xxm-green-700' },
  FAILED: { label: 'Failed', dot: 'bg-red-500',      badge: 'bg-red-100 text-red-700'   },
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
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id
  const params = await searchParams
  const cursor = params.cursor
  const channelFilter = params.channel as NotifChannel | undefined
  const statusFilter = params.status as NotifStatus | undefined

  const validChannels: NotifChannel[] = ['SMS', 'EMAIL', 'PUSH']
  const validStatuses: NotifStatus[] = ['QUEUED', 'SENT', 'FAILED']

  const channelWhere = channelFilter && validChannels.includes(channelFilter) ? channelFilter : undefined
  const statusWhere = statusFilter && validStatuses.includes(statusFilter) ? statusFilter : undefined

  const { items, total, failedCount, nextCursor } = await getMemberNotifications(userId, {
    channel: channelWhere,
    status: statusWhere,
    cursor,
    limit: PAGE_SIZE,
  })

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

      {/* ── Header ─────────────────────────────────── */}
      <Reveal variant="up" className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-100 to-sky-50 flex items-center justify-center shrink-0 ring-1 ring-sky-200/60">
            <Bell size={22} className="text-sky-600" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">Notifications</h1>
            <p className="text-sm text-xxm-gray-500 mt-1">
              {total} notification{total !== 1 ? 's' : ''}
              {failedCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 text-red-600 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" aria-hidden />
                  {failedCount} failed
                </span>
              )}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/profile"
          className="shrink-0 inline-flex items-center px-3 py-1.5 rounded-xl bg-xxm-green-50 text-xxm-green text-xs font-semibold hover:bg-xxm-green-100 transition-colors"
        >
          Manage preferences
        </Link>
      </Reveal>

      {/* ── Filter chips ───────────────────────────── */}
      <Reveal variant="up" delay={100} className="flex flex-wrap gap-1.5 items-center">
        <FilterChip label="All" href={buildUrl({ channel: undefined, cursor: undefined }) as Route} active={!channelFilter} />
        {validChannels.map((ch) => (
          <FilterChip
            key={ch}
            label={CHANNEL_LABELS[ch]}
            href={buildUrl({ channel: ch, cursor: undefined }) as Route}
            active={channelFilter === ch}
          />
        ))}
        <div className="w-px h-4 bg-xxm-gray-200 mx-1" aria-hidden />
        <FilterChip label="All status" href={buildUrl({ status: undefined, cursor: undefined }) as Route} active={!statusFilter} />
        {validStatuses.map((s) => (
          <FilterChip
            key={s}
            label={STATUS_CONFIG[s].label}
            href={buildUrl({ status: s, cursor: undefined }) as Route}
            active={statusFilter === s}
          />
        ))}
      </Reveal>

      {/* ── List ───────────────────────────────────── */}
      <Reveal variant="up" delay={200}>
      {items.length === 0 ? (
        <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-14 text-center">
          <div className="w-16 h-16 rounded-3xl bg-sky-50 flex items-center justify-center mx-auto mb-4">
            <Bell size={26} className="text-sky-300" aria-hidden />
          </div>
          <p className="text-xxm-green-900 font-bold">No notifications yet</p>
          <p className="text-xxm-gray-400 text-xs mt-1.5 max-w-xs mx-auto">
            Delivery confirmations, payment alerts, and reminders will appear here.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden divide-y divide-xxm-gray-50">
          {(items as NotificationItem[]).map((n) => {
            const cfg = STATUS_CONFIG[n.status as NotifStatus] ?? STATUS_CONFIG.QUEUED
            const date = n.sentAt ?? n.createdAt
            const ChannelIcon = CHANNEL_ICONS[n.channel as NotifChannel] ?? Bell
            return (
              <div key={n.id} className="group flex items-center gap-4 px-5 py-4 hover:bg-xxm-green-50/20 transition-colors">
                <div className="w-9 h-9 rounded-xl bg-xxm-green-50 flex items-center justify-center shrink-0 transition-transform duration-slow group-hover:scale-110" aria-hidden>
                  <ChannelIcon size={15} className="text-xxm-green" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-xxm-green-900 truncate">
                    {slugToTitle(n.template.slug)}
                  </p>
                  <p className="text-[11px] text-xxm-gray-400 mt-0.5">
                    {CHANNEL_LABELS[n.channel as NotifChannel] ?? n.channel} · {formatRelative(date)}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 ${cfg.badge}`}
                  role="status"
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} aria-hidden />
                  {cfg.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
      </Reveal>

      {/* ── Cursor pagination ──────────────────────── */}
      {(nextCursor || cursor) && (
        <div className="flex justify-between">
          {cursor ? (
            <Link
              href={buildUrl({ cursor: undefined }) as Route}
              className="text-sm font-semibold text-xxm-green hover:text-xxm-canopy transition-colors"
            >
              ← Back to latest
            </Link>
          ) : (
            <span />
          )}
          {nextCursor && (
            <Link
              href={buildUrl({ cursor: nextCursor }) as Route}
              className="text-sm font-semibold text-xxm-green hover:text-xxm-canopy transition-colors"
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
      className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
        active
          ? 'bg-xxm-green text-white shadow-sm'
          : 'bg-xxm-gray-100 text-xxm-gray-600 hover:bg-xxm-gray-200'
      }`}
    >
      {label}
    </Link>
  )
}
