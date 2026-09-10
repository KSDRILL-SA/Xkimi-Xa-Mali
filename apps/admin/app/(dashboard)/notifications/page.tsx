import type { Metadata } from 'next'
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { internalAdminPost } from '@/lib/api'
import { getBroadcastAudience } from '@/lib/services'
import { Alert, Reveal } from '@xxm/ui'
import { Megaphone, MessageSquare, Mail, Layers, Inbox, Users, UserCheck, Clock, Ban, Send, Type } from 'lucide-react'
import { requireAdmin } from '@/lib/admin-action'

export const metadata: Metadata = { title: 'Broadcast' }

type Channel = 'SMS' | 'EMAIL' | 'BOTH' | 'IN_APP'
type Filter  = 'ALL' | 'ACTIVE' | 'PENDING' | 'SUSPENDED'

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; failed?: string; total?: string; smsSent?: string; emailSent?: string; deliveryFailed?: string }>
}) {
  const session = await auth()
  const roles   = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')

  const params = await searchParams
  const sent   = params.sent   === '1'
  const failed = params.failed === '1'
  // Real delivery counts from the route's response — not just whether the
  // HTTP call itself succeeded. The API call succeeding (`sent=1`) used to
  // be the only signal shown here, so a broadcast that reached the route,
  // then failed to actually deliver to a single member, still showed
  // "Broadcast sent" with no indication anything was wrong.
  const total          = Number(params.total ?? 0)
  const deliveryFailed = Number(params.deliveryFailed ?? 0)
  const smsSent        = Number(params.smsSent ?? 0)
  const emailSent      = Number(params.emailSent ?? 0)
  const partialFailure = sent && deliveryFailed > 0

  async function broadcast(fd: FormData) {
    'use server'
    const { userId, ip } = await requireAdmin('notifications.broadcast', { bulk: true })

    const subject = (fd.get('subject') as string)?.trim()
    const message = (fd.get('message') as string)?.trim()
    const channel = fd.get('channel') as Channel
    const filter  = fd.get('filter')  as Filter

    if (!message || message.length < 5) redirect('/notifications?failed=1')
    if (!subject || subject.length < 3) redirect('/notifications?failed=1')

    // The acting admin must travel with the request. Without these the web app
    // has no session to read — this is a server-to-server call, so no cookies —
    // and cannot record who sent the broadcast. Contributions and invitations
    // already forward them; this one did not, which is why every broadcast
    // failed. `adminIp` matters for the same reason: without it the audit trail
    // records our own server as the origin rather than the admin who clicked.
    const result = await internalAdminPost<{
      total: number
      smsSent: number
      emailSent: number
      inAppSent: number
      failed: number
    }>(
      '/api/v1/admin/notifications/broadcast',
      { subject, message, channel, filter },
      { adminUserId: userId, adminIp: ip },
    )

    if (!result.ok) redirect('/notifications?failed=1')

    // The HTTP call succeeding only ever meant the route accepted the
    // request — not that any message actually reached anyone. It used to be
    // the only thing checked, so a broadcast that reached zero of its
    // members (a BulkSMS or Resend failure on every send) still redirected
    // to the same "Broadcast sent" banner as one that reached all of them.
    // The route's real per-channel counts travel through the redirect now,
    // so the banner can say what actually happened.
    const { total, smsSent, emailSent, failed } = result.data ?? { total: 0, smsSent: 0, emailSent: 0, failed: 0 }
    redirect(
      `/notifications?sent=1&total=${total}&smsSent=${smsSent}&emailSent=${emailSent}&deliveryFailed=${failed}`,
    )
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

      {/* Three real outcomes, not two: the route call succeeding used to be
          the only thing checked, so a broadcast that reached zero of its
          members (every send failing — a provider outage, a revoked API
          key, an account issue) redirected to the exact same "Broadcast
          sent" banner as one that reached everybody. `deliveryFailed`
          carries the route's actual per-recipient failure count, so a
          total loss and a full success no longer look identical here. */}
      {sent && !partialFailure && (
        <Alert variant="success" title="Broadcast sent">
          {smsSent > 0 || emailSent > 0
            ? `Delivered — ${smsSent} SMS, ${emailSent} email, across ${total} member${total === 1 ? '' : 's'}.`
            : 'Your message has been dispatched to the selected members.'}
        </Alert>
      )}
      {partialFailure && (
        <Alert variant={deliveryFailed >= total ? 'error' : 'warning'} title={deliveryFailed >= total ? 'Broadcast did not reach anyone' : 'Broadcast partially failed'}>
          {`${deliveryFailed} of ${total} member${total === 1 ? '' : 's'} did not receive it (${smsSent} SMS and ${emailSent} email delivered). Check the audit log or server logs for the reason before resending.`}
        </Alert>
      )}
      {failed && <Alert variant="error" title="Broadcast failed">Something went wrong. Please check your message and try again.</Alert>}

      <div className="max-w-2xl">
        <form action={broadcast} className="space-y-6">

          {/* ── Subject ──────────────────────────────────────── */}
          {/* Every broadcast used to arrive titled "Message from Xkimi Xa Mali
              Foundation" — the same words for a meeting reminder and a change
              to the contribution amount. It is the only line most members read
              before deciding whether to open it, so it is written per message
              and required. */}
          <Reveal variant="up" delay={50} className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-6 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Type size={16} className="text-xxm-gray-500" aria-hidden />
              <label htmlFor="bc-subject" className="text-sm font-bold text-xxm-green-900">
                Subject <span className="text-red-400">*</span>
              </label>
            </div>
            <input
              id="bc-subject"
              name="subject"
              required
              minLength={3}
              maxLength={120}
              placeholder="e.g. September meeting moved to Saturday"
              className="w-full rounded-xl border border-xxm-gray-200 px-4 py-3 text-sm text-xxm-green-900 focus:outline-none focus:ring-2 focus:ring-xxm-green/25 bg-white placeholder:text-xxm-gray-400"
            />
            <p className="text-[11px] text-xxm-gray-400">
              Becomes the email subject, the email heading and the title in each member&apos;s inbox.
              Say what it is about, not who it is from.
            </p>
          </Reveal>

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
