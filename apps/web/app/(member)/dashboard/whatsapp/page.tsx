import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export const metadata: Metadata = { title: 'WhatsApp Notifications' }

async function setWhatsAppPreference(enabled: boolean, userId: string) {
  'use server'
  await db.notificationPreference.upsert({
    where: { userId },
    create: { userId, sms: true, email: true, push: enabled },
    update: { push: enabled },
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
      select: { push: true },
    }),
  ])

  const isEnabled = pref?.push ?? true
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
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
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
                <span className="text-amber-600">No phone number on your profile</span>
              )}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              phone
                ? 'bg-green-100 text-green-700'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${phone ? 'bg-green-500' : 'bg-amber-500'}`}
            />
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
          <span
            className={`shrink-0 mt-0.5 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${
              isEnabled
                ? 'bg-xxm-green-100 text-xxm-green-800'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {isEnabled ? 'On' : 'Off'}
          </span>
        </div>

        {/* Action */}
        {phone ? (
          isEnabled ? (
            <form action={disableAction}>
              <button
                type="submit"
                className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
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
