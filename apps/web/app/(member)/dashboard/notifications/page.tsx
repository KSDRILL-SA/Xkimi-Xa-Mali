import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getInbox } from '@/services/inbox.service'
import { getMemberNotifications } from '@/services/notification.service'
import { Reveal } from '@xxm/ui'
import { Inbox as InboxIcon, MessageSquare, Mail, Bell, ScrollText, type LucideIcon } from 'lucide-react'
import { InboxList } from '@/components/inbox/InboxList'

export const metadata: Metadata = { title: 'Inbox' }

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

const CHANNEL_LABELS: Record<NotifChannel, string> = { SMS: 'SMS', EMAIL: 'Email', PUSH: 'Push' }
const CHANNEL_ICONS: Record<NotifChannel, LucideIcon> = { SMS: MessageSquare, EMAIL: Mail, PUSH: Bell }
const STATUS_CONFIG: Record<NotifStatus, { label: string; dot: string; badge: string }> = {
  QUEUED: { label: 'Queued', dot: 'bg-sky-500',   badge: 'bg-sky-100 text-sky-700' },
  SENT:   { label: 'Sent',   dot: 'bg-xxm-green', badge: 'bg-xxm-green-100 text-xxm-green-700' },
  FAILED: { label: 'Failed', dot: 'bg-red-500',   badge: 'bg-red-100 text-red-700' },
}

function slugToTitle(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatRelative(date: Date): string {
  const mins = Math.floor((Date.now() - date.getTime()) / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id
  const params = await searchParams
  const view = params.view === 'log' ? 'log' : 'inbox'

  const [inbox, log] = await Promise.all([
    getInbox(userId, { limit: 30 }),
    getMemberNotifications(userId, { limit: 30 }),
  ])

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────── */}
      <Reveal variant="up" className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-xxm-gold/20 to-xxm-gold/5 flex items-center justify-center shrink-0 ring-1 ring-xxm-gold/20">
            <InboxIcon size={22} className="text-xxm-gold-dark" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">Inbox</h1>
            <p className="text-sm text-xxm-gray-500 mt-1">
              {inbox.unreadCount > 0
                ? <><span className="font-semibold text-xxm-gold-dark">{inbox.unreadCount}</span> unread message{inbox.unreadCount !== 1 ? 's' : ''}</>
                : 'You’re all caught up'}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/profile"
          className="shrink-0 inline-flex items-center px-3 py-1.5 rounded-xl bg-xxm-green-50 text-xxm-green text-xs font-semibold hover:bg-xxm-green-100 transition-colors"
        >
          Preferences
        </Link>
      </Reveal>

      {/* ── Tabs ───────────────────────────────────── */}
      <Reveal variant="up" delay={100} className="flex items-center gap-2">
        <TabLink href="/dashboard/notifications" label="Messages" icon={InboxIcon} active={view === 'inbox'} badge={inbox.unreadCount} />
        <TabLink href="/dashboard/notifications?view=log" label="Delivery log" icon={ScrollText} active={view === 'log'} />
      </Reveal>

      {/* ── Content ────────────────────────────────── */}
      <Reveal variant="up" delay={200}>
        {view === 'inbox' ? (
          <InboxList initial={inbox} />
        ) : log.items.length === 0 ? (
          <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-14 text-center">
            <div className="w-16 h-16 rounded-3xl bg-sky-50 flex items-center justify-center mx-auto mb-4">
              <ScrollText size={26} className="text-sky-300" aria-hidden />
            </div>
            <p className="text-xxm-green-900 font-bold">No delivery records yet</p>
            <p className="text-xxm-gray-400 text-xs mt-1.5 max-w-xs mx-auto">
              SMS and email delivery confirmations will be logged here.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden divide-y divide-xxm-gray-50">
            {(log.items as NotificationItem[]).map((n) => {
              const cfg = STATUS_CONFIG[n.status as NotifStatus] ?? STATUS_CONFIG.QUEUED
              const date = n.sentAt ?? n.createdAt
              const ChannelIcon = CHANNEL_ICONS[n.channel as NotifChannel] ?? Bell
              return (
                <div key={n.id} className="group flex items-center gap-4 px-5 py-4 hover:bg-xxm-green-50/20 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-xxm-green-50 flex items-center justify-center shrink-0 transition-transform duration-slow group-hover:scale-110" aria-hidden>
                    <ChannelIcon size={15} className="text-xxm-green" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-xxm-green-900 truncate">{slugToTitle(n.template.slug)}</p>
                    <p className="text-[11px] text-xxm-gray-400 mt-0.5">
                      {CHANNEL_LABELS[n.channel as NotifChannel] ?? n.channel} · {formatRelative(date)}
                    </p>
                  </div>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 ${cfg.badge}`} role="status">
                    <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} aria-hidden />
                    {cfg.label}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </Reveal>
    </div>
  )
}

function TabLink({ href, label, icon: Icon, active, badge = 0 }: { href: Route; label: string; icon: LucideIcon; active: boolean; badge?: number }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-fast ${
        active ? 'bg-xxm-green text-white shadow-xxm-sm' : 'bg-xxm-gray-100 text-xxm-gray-600 hover:bg-xxm-gray-200'
      }`}
    >
      <Icon size={15} aria-hidden />
      {label}
      {badge > 0 && (
        <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${active ? 'bg-white/25 text-white' : 'bg-xxm-gold text-xxm-green-900'}`}>
          {badge}
        </span>
      )}
    </Link>
  )
}
