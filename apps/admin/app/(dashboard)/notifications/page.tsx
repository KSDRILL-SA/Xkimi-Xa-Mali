import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Alert, Reveal } from '@xxm/ui'
import { Megaphone, MessageSquare, Mail, Layers, Users, UserCheck, Clock, Ban, Send } from 'lucide-react'

export const metadata: Metadata = { title: 'Broadcast' }

type Channel = 'SMS' | 'EMAIL' | 'BOTH'
type Filter  = 'ALL' | 'ACTIVE' | 'PENDING' | 'SUSPENDED'

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; failed?: string }>
}) {
  const session = await auth()
  const roles   = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')

  const params = await searchParams
  const sent   = params.sent   === '1'
  const failed = params.failed === '1'

  async function broadcast(fd: FormData) {
    'use server'
    const s = await auth()
    if (!s?.user?.id) redirect('/login')
    const r = (s?.user?.roles as string[] | undefined) ?? []
    if (!r.includes('ADMIN')) redirect('/forbidden')

    const message = (fd.get('message') as string)?.trim()
    const channel = fd.get('channel') as Channel
    const filter  = fd.get('filter')  as Filter

    if (!message || message.length < 5) redirect('/notifications?failed=1')

    const webUrl      = process.env['WEB_INTERNAL_URL'] ?? process.env['NEXTAUTH_URL'] ?? ''
    const adminSecret = process.env['ADMIN_API_SECRET'] ?? ''
    if (!webUrl || !adminSecret) redirect('/notifications?failed=1')

    try {
      const res = await fetch(`${webUrl}/api/v1/admin/notifications/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-admin-secret':    adminSecret,
          'x-admin-timestamp': String(Date.now()),
        },
        body: JSON.stringify({ message, channel, filter }),
      })
      if (!res.ok) redirect('/notifications?failed=1')
      redirect('/notifications?sent=1')
    } catch {
      redirect('/notifications?failed=1')
    }
  }

  const channels: { value: Channel; label: string; icon: React.FC<{ size?: number; className?: string }>; description: string }[] = [
    { value: 'SMS',   label: 'SMS only',    icon: MessageSquare, description: 'Text message to phone' },
    { value: 'EMAIL', label: 'Email only',  icon: Mail,          description: 'Email to inbox' },
    { value: 'BOTH',  label: 'SMS + Email', icon: Layers,        description: 'Both channels' },
  ]

  const filters: { value: Filter; label: string; icon: React.FC<{ size?: number; className?: string }>; description: string }[] = [
    { value: 'ALL',       label: 'All members',     icon: Users,      description: 'Every registered member' },
    { value: 'ACTIVE',    label: 'Active only',     icon: UserCheck,  description: 'Active members only' },
    { value: 'PENDING',   label: 'Pending only',    icon: Clock,      description: 'Pending approval' },
    { value: 'SUSPENDED', label: 'Suspended only',  icon: Ban,        description: 'Suspended accounts' },
  ]

  return (
    <div className="space-y-7">

      {/* ── Page header ─────────────────────────────────────── */}
      <Reveal variant="up" className="group flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center shrink-0 transition-transform duration-slow group-hover:scale-110">
          <Megaphone size={22} className="text-purple-600" aria-hidden />
        </div>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">Broadcast</h1>
          <p className="text-sm text-xxm-gray-500 mt-1">Send notifications to all or filtered members via SMS and email.</p>
        </div>
      </Reveal>

      {sent   && <Alert variant="success" title="Broadcast sent">Your message has been dispatched to the selected members.</Alert>}
      {failed && <Alert variant="error"   title="Broadcast failed">Something went wrong. Please check your message and try again.</Alert>}

      <div className="max-w-2xl">
        <form action={broadcast} className="space-y-6">

          {/* ── Message ──────────────────────────────────────── */}
          <Reveal variant="up" delay={100} className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-6 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <MessageSquare size={16} className="text-xxm-gray-500" aria-hidden />
              <label htmlFor="bc-message" className="text-sm font-bold text-xxm-green-900">
                Message <span className="text-red-400">*</span>
              </label>
            </div>
            <textarea
              id="bc-message"
              name="message"
              required
              minLength={5}
              maxLength={500}
              rows={5}
              placeholder="Type your message here… (max 500 characters)"
              className="w-full rounded-xl border border-xxm-gray-200 px-4 py-3 text-sm text-xxm-green-900 focus:outline-none focus:ring-2 focus:ring-xxm-green/25 bg-white resize-none placeholder:text-xxm-gray-400 leading-relaxed"
            />
            <p className="text-[11px] text-xxm-gray-400">Keep messages concise. SMS costs apply per message per recipient.</p>
          </Reveal>

          {/* ── Channel ──────────────────────────────────────── */}
          <Reveal variant="up" delay={200} className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-6 space-y-3">
            <p className="text-sm font-bold text-xxm-green-900 mb-3">Delivery Channel</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {channels.map(({ value, label, icon: Icon, description }) => (
                <label key={value} className="relative flex flex-col gap-2 p-4 rounded-xl border-2 border-xxm-gray-200 cursor-pointer hover:border-xxm-green/40 has-[:checked]:border-xxm-green has-[:checked]:bg-xxm-green-50 transition-all">
                  <input type="radio" name="channel" value={value} defaultChecked={value === 'SMS'} className="sr-only" />
                  <Icon size={18} className="text-xxm-green-700" aria-hidden />
                  <span className="text-sm font-semibold text-xxm-green-900">{label}</span>
                  <span className="text-[11px] text-xxm-gray-400 leading-snug">{description}</span>
                </label>
              ))}
            </div>
          </Reveal>

          {/* ── Audience filter ───────────────────────────────── */}
          <Reveal variant="up" delay={300} className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-6 space-y-3">
            <p className="text-sm font-bold text-xxm-green-900 mb-3">Send To</p>
            <div className="grid grid-cols-2 gap-2">
              {filters.map(({ value, label, icon: Icon, description }) => (
                <label key={value} className="relative flex items-center gap-3 p-3 rounded-xl border-2 border-xxm-gray-200 cursor-pointer hover:border-xxm-green/40 has-[:checked]:border-xxm-green has-[:checked]:bg-xxm-green-50 transition-all">
                  <input type="radio" name="filter" value={value} defaultChecked={value === 'ACTIVE'} className="sr-only" />
                  <div className="w-8 h-8 rounded-lg bg-xxm-green-50 flex items-center justify-center shrink-0">
                    <Icon size={14} className="text-xxm-green" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-xxm-green-900">{label}</p>
                    <p className="text-[11px] text-xxm-gray-400">{description}</p>
                  </div>
                </label>
              ))}
            </div>
          </Reveal>

          {/* ── Submit ───────────────────────────────────────── */}
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-xxm-green text-white text-sm font-bold hover:bg-xxm-canopy hover:-translate-y-0.5 transition-all duration-fast ease-smooth shadow-xxm-sm"
          >
            <Send size={16} aria-hidden />
            Send Broadcast
          </button>

        </form>
      </div>

    </div>
  )
}
