'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import { Megaphone, Info, Wallet, Target, Trash2, CheckCheck, Inbox as InboxIcon, Loader2 } from 'lucide-react'

type InboxItem = {
  id: string
  title: string
  body: string
  category: 'BROADCAST' | 'SYSTEM' | 'PAYMENT' | 'GOAL'
  read: boolean
  createdAt: string
}

type Props = {
  initial: { items: InboxItem[]; total: number; unreadCount: number; nextCursor: string | null }
}

const CATEGORY = {
  BROADCAST: { icon: Megaphone, accent: 'text-xxm-gold-dark', chip: 'bg-xxm-gold/12 text-xxm-gold-dark', label: 'Announcement', bar: 'bg-xxm-gold' },
  SYSTEM:    { icon: Info,      accent: 'text-sky-600',       chip: 'bg-sky-50 text-sky-700',           label: 'System',       bar: 'bg-sky-500' },
  PAYMENT:   { icon: Wallet,    accent: 'text-xxm-green',     chip: 'bg-xxm-green-50 text-xxm-green-700', label: 'Payment',      bar: 'bg-xxm-green' },
  GOAL:      { icon: Target,    accent: 'text-violet-600',    chip: 'bg-violet-50 text-violet-700',     label: 'Goal',         bar: 'bg-violet-500' },
} as const

function relative(iso: string): string {
  const d = new Date(iso)
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function InboxList({ initial }: Props) {
  const [items, setItems] = useState<InboxItem[]>(initial.items)
  const [unread, setUnread] = useState(initial.unreadCount)
  const [cursor, setCursor] = useState<string | null>(initial.nextCursor)
  const [loadingMore, setLoadingMore] = useState(false)

  async function markRead(item: InboxItem) {
    if (item.read) return
    setItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, read: true } : m)))
    setUnread((u) => Math.max(0, u - 1))
    try { await api.patch(`/api/v1/inbox/${item.id}`) } catch { /* best-effort */ }
  }

  async function markAll() {
    if (unread === 0) return
    setItems((prev) => prev.map((m) => ({ ...m, read: true })))
    setUnread(0)
    try { await api.post('/api/v1/inbox/read-all') } catch { /* best-effort */ }
  }

  async function remove(item: InboxItem, e: React.MouseEvent) {
    e.stopPropagation()
    const prev = items
    setItems((c) => c.filter((x) => x.id !== item.id))
    if (!item.read) setUnread((u) => Math.max(0, u - 1))
    try { await api.delete(`/api/v1/inbox/${item.id}`) } catch { setItems(prev) }
  }

  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await api.get<{ items: InboxItem[]; nextCursor: string | null }>(`/api/v1/inbox?cursor=${cursor}`)
      setItems((prev) => [...prev, ...res.items])
      setCursor(res.nextCursor)
    } catch { /* ignore */ } finally {
      setLoadingMore(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-14 text-center">
        <div className="w-16 h-16 rounded-3xl bg-xxm-gold/10 flex items-center justify-center mx-auto mb-4">
          <InboxIcon size={26} className="text-xxm-gold-dark/50" aria-hidden />
        </div>
        <p className="text-xxm-green-900 font-bold">Your inbox is empty</p>
        <p className="text-xxm-gray-400 text-xs mt-1.5 max-w-xs mx-auto">
          Announcements from the admin and important updates will land here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {unread > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-xxm-gray-500">
            <span className="text-xxm-gold-dark">{unread}</span> unread
          </p>
          <button
            type="button"
            onClick={markAll}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-xxm-green hover:text-xxm-canopy transition-colors"
          >
            <CheckCheck size={14} aria-hidden /> Mark all read
          </button>
        </div>
      )}

      <ul className="space-y-2.5">
        {items.map((m, i) => {
          const cat = CATEGORY[m.category] ?? CATEGORY.SYSTEM
          const Icon = cat.icon
          return (
            <li
              key={m.id}
              onClick={() => markRead(m)}
              style={{ animationDelay: `${Math.min(i, 10) * 35}ms` }}
              className={`group relative flex gap-3 overflow-hidden rounded-2xl border p-4 cursor-pointer animate-fade-in-up transition-all duration-slow ${
                m.read
                  ? 'bg-white border-xxm-green/8 shadow-xxm-sm'
                  : 'bg-gradient-to-r from-xxm-gold/[0.06] to-white border-xxm-gold/25 shadow-xxm-sm hover:shadow-xxm'
              }`}
            >
              {!m.read && <span className={`absolute left-0 top-0 bottom-0 w-1 ${cat.bar}`} aria-hidden />}

              <div className={`w-10 h-10 rounded-2xl bg-xxm-gray-50 flex items-center justify-center shrink-0 transition-transform duration-slow group-hover:scale-110 ${cat.accent}`}>
                <Icon size={17} aria-hidden />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm truncate ${m.read ? 'font-semibold text-xxm-green-900' : 'font-extrabold text-xxm-green-900'}`}>{m.title}</p>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold ${cat.chip}`}>{cat.label}</span>
                  {!m.read && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-xxm-gold-dark"><span className="w-1.5 h-1.5 rounded-full bg-xxm-gold animate-pulse" aria-hidden />New</span>}
                  <span className="ml-auto text-[11px] text-xxm-gray-400 shrink-0">{relative(m.createdAt)}</span>
                </div>
                <p className="text-sm text-xxm-gray-600 mt-1 leading-relaxed whitespace-pre-wrap break-words">{m.body}</p>
              </div>

              <button
                type="button"
                onClick={(e) => remove(m, e)}
                className="self-start text-xxm-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                aria-label="Delete message"
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          )
        })}
      </ul>

      {cursor && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-xxm-green hover:text-xxm-canopy transition-colors disabled:opacity-60"
          >
            {loadingMore ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
            Load older
          </button>
        </div>
      )}
    </div>
  )
}
