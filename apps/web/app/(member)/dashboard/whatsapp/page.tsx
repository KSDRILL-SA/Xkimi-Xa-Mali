import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CheckCircle2, ExternalLink, MessageCircle } from 'lucide-react'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

export const metadata: Metadata = { title: 'WhatsApp Notifications' }

async function setWhatsAppPreference(enabled: boolean, userId: string) {
  'use server'
  await db.notificationPreference.upsert({
    where: { userId },
    create: { userId, sms: true, email: true, whatsapp: enabled },
    update: { whatsapp: enabled },
  })
  await db.auditLog.create({
    data: {
      userId,
      action: 'WHATSAPP_PREFERENCE_UPDATED',
      entity: 'NotificationPreference',
      entityId: userId,
      payload: { enabled },
    },
  })
  redirect(`/dashboard/whatsapp?updated=1`)
}

export default async function WhatsAppPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id
  const params = await searchParams

  const [user, pref] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { phone: true, firstName: true },
    }),
    db.notificationPreference.findUnique({
      where: { userId },
      select: { whatsapp: true },
    }),
  ])

  const isEnabled = pref?.whatsapp ?? true
  const phone = user?.phone ?? null
  const showBanner = params.updated === '1'

  const enableAction = setWhatsAppPreference.bind(null, true, userId)
  const disableAction = setWhatsAppPreference.bind(null, false, userId)

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-bold text-xxm-green-900">WhatsApp Notifications</h1>
        <p className="text-sm text-gray-500 mt-1">
          Receive payment alerts and reminders via WhatsApp.
        </p>
      </div>

      {showBanner && (
        <div className="xxm-banner-success">
          Preference saved successfully.
        </div>
      )}

      {/* Status card */}
      <div className="xxm-card p-6 space-y-5">
        {/* Linked number */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-700">Linked number</p>
            <p className="text-sm text-gray-500 mt-0.5">
              {phone ? (
                <span className="font-mono text-gray-800">{phone}</span>
              ) : (
                <span className="xxm-text-warning">No phone number on your profile</span>
              )}
            </p>
          </div>
          <span className={phone ? 'xxm-status-success' : 'xxm-status-warning'}>
            {phone ? 'Verified' : 'Missing'}
          </span>
        </div>

        <div className="border-t border-gray-100" />

        {/* Opt-in toggle */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-700">WhatsApp opt-in</p>
            <p className="text-sm text-gray-500 mt-0.5">
              {isEnabled
                ? 'You will receive WhatsApp messages for payment confirmations, overdue reminders, and important updates.'
                : 'You have opted out. No WhatsApp messages will be sent to your number.'}
            </p>
          </div>
          <span className={`shrink-0 mt-0.5 ${isEnabled ? 'xxm-status-success' : 'xxm-status-pending'}`}>
            {isEnabled ? 'On' : 'Off'}
          </span>
        </div>

        {/* Action */}
        {phone ? (
          isEnabled ? (
            <form action={disableAction}>
              <button
                type="submit"
                className="xxm-btn-danger"
              >
                Opt out of WhatsApp notifications
              </button>
            </form>
          ) : (
            <form action={enableAction}>
              <button
                type="submit"
                className="w-full rounded-lg bg-xxm-green px-4 py-2.5 text-sm font-semibold text-white hover:bg-xxm-green-700 transition-colors"
              >
                Opt in to WhatsApp notifications
              </button>
            </form>
          )
        ) : (
          <a
            href="/dashboard/profile"
            className="block w-full text-center rounded-lg border border-xxm-green-200 bg-xxm-green-50 px-4 py-2.5 text-sm font-medium text-xxm-green-800 hover:bg-xxm-green-100 transition-colors"
          >
            Add phone number on profile →
          </a>
        )}
      </div>

      {/* Group link */}
      <div className="xxm-card p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 shrink-0 xxm-icon-bg-success">
            <MessageCircle size={18} aria-hidden />
          </div>
          <div>
            <p className="font-bold text-xxm-green-900">Join the WhatsApp Group</p>
            <p className="text-sm text-gray-500 mt-0.5">
              Stay connected with the community — announcements, goal updates, and group discussions.
            </p>
          </div>
        </div>
        <a
          href={env.WHATSAPP_GROUP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-green-700 transition-colors"
        >
          Open WhatsApp Group
          <ExternalLink size={13} aria-hidden />
        </a>
        {env.ADMIN_WHATSAPP_NUMBER && (
          <div className="pt-1 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-2">Want to join? Message the admin directly:</p>
            <a
              href={`https://wa.me/${env.ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent('Hi, I would like to join the Xkimm Xa Mali WhatsApp group. Please add me.')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-xxm-green-700 hover:text-xxm-green font-medium transition-colors"
            >
              <MessageCircle size={14} aria-hidden />
              Message Admin to Join
            </a>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-4 space-y-2">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          What you will receive
        </p>
        <ul className="space-y-1.5 text-sm text-gray-600">
          {[
            'Payment confirmation when a debit is processed',
            'Overdue reminder if a contribution is unpaid',
            'Mandate status updates (active, cancelled)',
            'Goal milestone alerts',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-xxm-green-600" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
        <p className="text-xs text-gray-400 pt-1">
          Full WhatsApp Business API integration is coming soon. Your preference is saved and will
          activate automatically when the channel goes live.
        </p>
      </div>
    </div>
  )
}
