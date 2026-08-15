import type { Metadata } from 'next'
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { internalAdminPost } from '@/lib/api'
import { getBroadcastAudience } from '@/lib/services'
import { Alert, Reveal } from '@xxm/ui'
import { Megaphone, MessageSquare, Mail, Layers, Inbox, Users, UserCheck, Clock, Ban, Send } from 'lucide-react'
import { requireAdmin } from '@/lib/admin-action'

export const metadata: Metadata = { title: 'Broadcast' }

type Channel = 'SMS' | 'EMAIL' | 'BOTH' | 'IN_APP'
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
    const { userId, ip } = await requireAdmin('notifications.broadcast', { bulk: true })

    const message = (fd.get('message') as string)?.trim()
    const channel = fd.get('channel') as Channel
    const filter  = fd.get('filter')  as Filter

    if (!message || message.length < 5) redirect('/notifications?failed=1')

    // The acting admin must travel with the request. Without these the web app
    // has no session to read — this is a server-to-server call, so no cookies —
    // and cannot record who sent the broadcast. Contributions and invitations
    // already forward them; this one did not, which is why every broadcast
    // failed. `adminIp` matters for the same reason: without it the audit trail
    // records our own server as the origin rather than the admin who clicked.
    const result = await internalAdminPost(
      '/api/v1/admin/notifications/broadcast',
      { message, channel, filter },
      { adminUserId: userId, adminIp: ip },
    )
    redirect(result.ok ? '/notifications?sent=1' : '/notifications?failed=1')
  }

  const channels: { value: Channel; label: string; icon: React.FC<{ size?: number; className?: string }>; description: string }[] = [
    { value: 'IN_APP', label: 'In-app',      icon: Inbox,         description: 'Lands in the member inbox · free' },
    { value: 'SMS',    label: 'SMS only',    icon: MessageSquare, description: 'Text message to phone' },
    { value: 'EMAIL',  label: 'Email only',  icon: Mail,          description: 'Email to inbox' },
    { value: 'BOTH',   label: 'SMS + Email', icon: Layers,        description: 'Both channels' },
  ]

  // How many people each choice actually reaches, shown while choosing rather
  // than discovered afterwards. A broadcast cannot be recalled and, on SMS,
  // costs money for every one of them.
  const audience = await getBroadcastAudience(roles)
  const people = (n: number) => `${n} member${n === 1 ? '' : 's'}`

  const filters: { value: Filter; label: string; icon: React.FC<{ size?: number; className?: string }>; description: string }[] = [
    { value: 'ALL',       label: 'All members',     icon: Users,      description: `Every registered member · ${people(audience.ALL)}` },
    { value: 'ACTIVE',    label: 'Active only',     icon: UserCheck,  description: `Active members only · ${people(audience.ACTIVE)}` },
    { value: 'PENDING',   label: 'Pending only',    icon: Clock,      description: `Pending approval · ${people(audience.PENDING)}` },
    { value: 'SUSPENDED', label: 'Suspended only',  icon: Ban,        description: `Suspended accounts · ${people(audience.SUSPENDED)}` },
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
          <Reveal variant="up" delay={100} className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-6 space-y-3">
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
          <Reveal variant="up" delay={200} className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-6 space-y-3">
            <p className="text-sm font-bold text-xxm-green-900 mb-3">Delivery Channel</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {channels.map(({ value, label, icon: Icon, description }) => (
                <label key={value} className="relative flex flex-col gap-2 p-4 rounded-xl border-2 border-xxm-gray-200 cursor-pointer hover:border-xxm-green/40 has-[:checked]:border-xxm-green has-[:checked]:bg-xxm-green-50 transition-all">
                  <input type="radio" name="channel" value={value} defaultChecked={value === 'IN_APP'} className="sr-only" />
                  <Icon size={18} className="text-xxm-green-700" aria-hidden />
                  <span className="text-sm font-semibold text-xxm-green-900">{label}</span>
                  <span className="text-[11px] text-xxm-gray-400 leading-snug">{description}</span>
                </label>
              ))}
            </div>
          </Reveal>

          {/* ── Audience filter ───────────────────────────────── */}
          <Reveal variant="up" delay={300} className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-6 space-y-3">
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
          {/* Confirmed. This is the one action that reaches everybody at once,
              costs money for each of them on SMS, and cannot be recalled — and
              it was a plain submit button. */}
          <ConfirmSubmitButton
            title="Send this to the members?"
            message={`A broadcast cannot be unsent. On SMS or SMS + Email it is charged for every recipient — up to ${audience.ALL} of them depending on the filter you chose. Check the message and the audience before sending.`}
            confirmLabel="Send it"
            className="w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-xxm-green text-white text-sm font-bold hover:bg-xxm-canopy hover:-translate-y-0.5 transition-all duration-fast ease-smooth shadow-xxm-sm"
          >
            <Send size={16} aria-hidden />
            Send Broadcast
          </ConfirmSubmitButton>

        </form>
      </div>

    </div>
  )
}
