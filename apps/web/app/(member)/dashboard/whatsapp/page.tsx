import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { CheckCircle2, ExternalLink, MessageCircle, Phone, Bell } from 'lucide-react'
import { getSession } from '@/lib/session'
import { clientIpFromHeaders } from '@xxm/utils/client-ip'
import { env } from '@/lib/env'
import { Reveal } from '@xxm/ui'
import { userRepo } from '@/repositories/user.repository'
import { getNotificationPreferences, updateNotificationPreferences } from '@/services/member.service'

export const metadata: Metadata = { title: 'WhatsApp Notifications' }

/**
 * Switch this member's WhatsApp notifications on or off.
 *
 * The member is taken from the session, never from an argument. This used to
 * accept `userId` as a bound parameter and trust it — and a server action is a
 * public endpoint, reachable by anyone who can craft the request whether or not
 * the page that renders the form was ever shown to them. `admin-action.ts` says
 * exactly that at the top of the admin console's gate, which is why every admin
 * action there establishes its own caller.
 *
 * Nothing downstream would have caught it: `updateNotificationPreferences`
 * takes a bare `userId` and no requester, so a signed-in member could flip
 * another member's WhatsApp preference by naming their id.
 *
 * The IP goes through `clientIpFromHeaders` rather than reading
 * `x-forwarded-for` directly. That header is attacker-controlled anywhere the
 * front door does not overwrite it, and this value lands in the audit trail —
 * so read raw, the caller chose what got recorded about them. The same fix the
 * admin console needed.
 */
async function setWhatsAppPreference(enabled: boolean) {
  'use server'
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const ip = clientIpFromHeaders(await headers())
  await updateNotificationPreferences(session.user.id, { whatsapp: enabled }, ip)
  redirect(`/dashboard/whatsapp?updated=1`)
}

export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string }>
}) {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id
  const params = await searchParams

  const [user, pref] = await Promise.all([
    userRepo.findById(userId, { select: { phone: true, firstName: true } }),
    getNotificationPreferences(userId),
  ])

  const isEnabled = pref?.whatsapp ?? true
  const phone = user?.phone ?? null
  const showBanner = params.updated === '1'

  const enableAction = setWhatsAppPreference.bind(null, true)
  const disableAction = setWhatsAppPreference.bind(null, false)

  return (
    <div className="space-y-6 max-w-lg">

      {/* ── Header ─────────────────────────────────── */}
      <Reveal variant="up" className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-50 flex items-center justify-center shrink-0 ring-1 ring-emerald-200/60">
          <MessageCircle size={22} className="text-emerald-600" aria-hidden />
        </div>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">WhatsApp Notifications</h1>
          <p className="text-sm text-xxm-gray-500 mt-1">
            Receive payment alerts and reminders via WhatsApp.
          </p>
        </div>
      </Reveal>

      {/* ── Success banner ─────────────────────────── */}
      {showBanner && (
        <div className="flex items-center gap-3 bg-xxm-green-50 border border-xxm-green/20 rounded-2xl px-5 py-3.5">
          <CheckCircle2 size={16} className="text-xxm-green shrink-0" aria-hidden />
          <p className="text-sm font-semibold text-xxm-green-800">Preference saved successfully.</p>
        </div>
      )}

      {/* ── Status card ────────────────────────────── */}
      <Reveal variant="up" delay={100} className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden">

        {/* Linked number row */}
        <div className="group flex items-center justify-between px-5 py-4 border-b border-xxm-gray-50 hover:bg-xxm-green-50/20 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-xxm-green-50 flex items-center justify-center shrink-0 transition-transform duration-slow group-hover:scale-110">
              <Phone size={15} className="text-xxm-green" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-xxm-gray-700">Linked number</p>
              <p className="text-xs text-xxm-gray-500 mt-0.5">
                {phone ? (
                  <span className="font-mono text-xxm-green-900">{phone}</span>
                ) : (
                  <span className="text-amber-600 font-medium">No phone number on your profile</span>
                )}
              </p>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
              phone
                ? 'bg-xxm-green-100 text-xxm-green-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${phone ? 'bg-xxm-green' : 'bg-amber-500'}`} aria-hidden />
            {phone ? 'Verified' : 'Missing'}
          </span>
        </div>

        {/* Opt-in toggle row */}
        <div className="group flex items-start justify-between gap-4 px-5 py-4 border-b border-xxm-gray-50 hover:bg-xxm-green-50/20 transition-colors">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-sky-50 flex items-center justify-center shrink-0 mt-0.5 transition-transform duration-slow group-hover:scale-110">
              <Bell size={15} className="text-sky-600" aria-hidden />
            </div>
            <div>
              <p className="text-sm font-semibold text-xxm-gray-700">WhatsApp opt-in</p>
              <p className="text-xs text-xxm-gray-500 mt-0.5 max-w-xs">
                {isEnabled
                  ? 'You will receive WhatsApp messages for payment confirmations, overdue reminders, and important updates.'
                  : 'You have opted out. No WhatsApp messages will be sent to your number.'}
              </p>
            </div>
          </div>
          <span
            className={`shrink-0 mt-0.5 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
              isEnabled
                ? 'bg-xxm-green-100 text-xxm-green-700'
                : 'bg-xxm-gray-100 text-xxm-gray-600'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-xxm-green' : 'bg-xxm-gray-400'}`} aria-hidden />
            {isEnabled ? 'On' : 'Off'}
          </span>
        </div>

        {/* Action button */}
        <div className="px-5 py-4">
          {phone ? (
            isEnabled ? (
              <form action={disableAction}>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 transition-colors"
                >
                  Opt out of WhatsApp notifications
                </button>
              </form>
            ) : (
              <form action={enableAction}>
                <button
                  type="submit"
                  className="w-full rounded-xl bg-xxm-green px-4 py-2.5 text-sm font-semibold text-white hover:bg-xxm-canopy transition-colors"
                >
                  Opt in to WhatsApp notifications
                </button>
              </form>
            )
          ) : (
            <a
              href="/dashboard/profile"
              className="block w-full text-center rounded-xl border border-xxm-green-200 bg-xxm-green-50 px-4 py-2.5 text-sm font-semibold text-xxm-green-800 hover:bg-xxm-green-100 transition-colors"
            >
              Add phone number on profile →
            </a>
          )}
        </div>
      </Reveal>

      {/* ── Group link card ────────────────────────── */}
      <Reveal variant="up" delay={200} className="group bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 transition-transform duration-slow group-hover:scale-110">
            <MessageCircle size={18} className="text-emerald-600" aria-hidden />
          </div>
          <div>
            <p className="font-bold text-xxm-green-900">Join the WhatsApp Group</p>
            <p className="text-sm text-xxm-gray-500 mt-0.5">
              Stay connected with the community — announcements, goal updates, and group discussions.
            </p>
          </div>
        </div>
        <a
          href={env.WHATSAPP_GROUP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm"
        >
          Open WhatsApp Group
          <ExternalLink size={13} aria-hidden />
        </a>
        {env.ADMIN_WHATSAPP_NUMBER && (
          <div className="pt-3 border-t border-xxm-gray-100">
            <p className="text-xs text-xxm-gray-400 mb-2">Want to join? Message the admin directly:</p>
            <a
              href={`https://wa.me/${env.ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent('Hi, I would like to join the Xkimi Xa Mali Foundation WhatsApp group. Please add me.')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-xxm-green hover:text-xxm-canopy transition-colors"
            >
              <MessageCircle size={14} aria-hidden />
              Message Admin to Join
            </a>
          </div>
        )}
      </Reveal>

      {/* ── What you'll receive ────────────────────── */}
      <Reveal variant="up" delay={300} className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-5 space-y-3">
        <p className="text-xs font-bold text-xxm-gray-400 uppercase tracking-widest">What you will receive</p>
        <ul className="space-y-2">
          {[
            'Payment confirmation when a debit is processed',
            'Overdue reminder if a contribution is unpaid',
            'Mandate status updates (active, cancelled)',
            'Goal milestone alerts',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2.5">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-xxm-green" aria-hidden />
              <span className="text-sm text-xxm-gray-600">{item}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-xxm-gray-400 pt-1 border-t border-xxm-gray-50">
          Full WhatsApp Business API integration is coming soon. Your preference is saved and will
          activate automatically when the channel goes live.
        </p>
      </Reveal>
    </div>
  )
}
