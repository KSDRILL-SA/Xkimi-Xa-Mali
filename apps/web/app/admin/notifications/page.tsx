import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { broadcastNotification } from '@/services/admin.service'
import type { BroadcastChannel, BroadcastFilter } from '@/services/admin.service'

export const metadata: Metadata = { title: 'Broadcast — Admin' }

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; smsSent?: string; emailSent?: string; failed?: string; total?: string }>
}) {
  const params = await searchParams

  async function send(fd: FormData) {
    'use server'
    const s       = await auth()
    const r       = (s!.user.roles as string[] | undefined) ?? []
    const message = (fd.get('message') as string).trim()
    const channel = fd.get('channel') as BroadcastChannel
    const filter  = (fd.get('filter') as BroadcastFilter) ?? 'ALL'
    const result  = await broadcastNotification(s!.user.id, r, message, channel, filter)
    redirect(`/admin/notifications?sent=1&smsSent=${result.smsSent}&emailSent=${result.emailSent}&failed=${result.failed}&total=${result.total}`)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-xxm-green">Broadcast Notification</h1>
        <p className="text-sm text-gray-500 mt-1">Send an SMS or email to all or filtered members.</p>
      </div>

      {params.sent === '1' && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-4 text-sm text-green-800 space-y-1">
          <p className="font-semibold">Broadcast sent</p>
          <p>{params.total} members targeted · {params.smsSent} SMS · {params.emailSent} emails
            {Number(params.failed) > 0 && <span className="text-red-600 ml-2">· {params.failed} failed</span>}
          </p>
        </div>
      )}

      <form action={send} className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
        {/* Message */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Message</label>
          <textarea
            name="message"
            required
            minLength={5}
            maxLength={480}
            rows={5}
            placeholder="Type your message here…"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-xxm-green/30 resize-none"
          />
          <p className="text-xs text-gray-400 mt-1">Max 480 characters (2 SMS parts).</p>
        </div>

        {/* Channel */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Channel</label>
          <div className="flex gap-4">
            {(['SMS', 'EMAIL', 'BOTH'] as BroadcastChannel[]).map((ch) => (
              <label key={ch} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input type="radio" name="channel" value={ch} defaultChecked={ch === 'SMS'} className="accent-xxm-green" />
                {ch === 'BOTH' ? 'SMS + Email' : ch}
              </label>
            ))}
          </div>
        </div>

        {/* Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Recipient filter</label>
          <div className="flex gap-4 flex-wrap">
            {([
              { value: 'ALL',       label: 'All members' },
              { value: 'ACTIVE',    label: 'Active only' },
              { value: 'PENDING',   label: 'Pending only' },
              { value: 'SUSPENDED', label: 'Suspended only' },
            ] as { value: BroadcastFilter; label: string }[]).map(({ value, label }) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input type="radio" name="filter" value={value} defaultChecked={value === 'ALL'} className="accent-xxm-green" />
                {label}
              </label>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-2.5 rounded-lg bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-green/90 transition-colors"
        >
          Send broadcast
        </button>

        <p className="text-xs text-gray-400">
          This action is irreversible. Every matching member will receive the message immediately.
          All broadcasts are recorded in the audit log.
        </p>
      </form>
    </div>
  )
}
