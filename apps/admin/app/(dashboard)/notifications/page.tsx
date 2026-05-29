import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Breadcrumb, PageHeader, Card, CardHeader, CardBody, Alert } from '@xxm/ui'

export const metadata: Metadata = { title: 'Broadcast' }

type Channel = 'SMS' | 'EMAIL' | 'BOTH'
type Filter  = 'ALL' | 'ACTIVE' | 'PENDING' | 'SUSPENDED'

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; failed?: string }>
}) {
  const params = await searchParams
  const sent   = params.sent   === '1'
  const failed = params.failed === '1'

  async function broadcast(fd: FormData) {
    'use server'
    const s = await auth()
    if (!s?.user?.id) redirect('/login')
    const roles = (s.user.roles as string[] | undefined) ?? []
    if (!roles.includes('ADMIN')) redirect('/forbidden')

    const message = (fd.get('message') as string)?.trim()
    const channel = fd.get('channel') as Channel
    const filter  = fd.get('filter')  as Filter

    if (!message || message.length < 5) {
      redirect('/notifications?failed=1')
    }

    try {
      const webUrl = process.env['WEB_INTERNAL_URL'] ?? process.env['NEXTAUTH_URL'] ?? ''
      await fetch(`${webUrl}/api/v1/admin/notifications/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-secret': process.env['ADMIN_API_SECRET'] ?? '' },
        body: JSON.stringify({ message, channel, filter }),
      })
      redirect('/notifications?sent=1')
    } catch {
      redirect('/notifications?failed=1')
    }
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Broadcast' }]} />
      <PageHeader title="Broadcast" subtitle="Send notifications to all or filtered members." />

      {sent   && <Alert variant="success" title="Broadcast sent">Your message has been dispatched.</Alert>}
      {failed && <Alert variant="error"   title="Broadcast failed">Something went wrong. Try again.</Alert>}

      <Card className="max-w-xl">
        <CardHeader title="Send a message" description="SMS, email, or both channels." />
        <CardBody>
          <form action={broadcast} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="bc-message" className="block text-sm font-medium text-xxm-gray-700">Message *</label>
              <textarea
                id="bc-message" name="message" required minLength={5} maxLength={500} rows={4}
                placeholder="Type your message here…"
                className="w-full rounded-xl border border-xxm-gray-200 px-3 py-2.5 text-sm text-xxm-green-900 focus:outline-none focus:ring-2 focus:ring-xxm-green/25 bg-white resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-xxm-gray-700">Channel</label>
                <select name="channel" defaultValue="SMS"
                  className="w-full rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25">
                  <option value="SMS">SMS only</option>
                  <option value="EMAIL">Email only</option>
                  <option value="BOTH">SMS + Email</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-xxm-gray-700">Send to</label>
                <select name="filter" defaultValue="ACTIVE"
                  className="w-full rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25">
                  <option value="ALL">All members</option>
                  <option value="ACTIVE">Active only</option>
                  <option value="PENDING">Pending only</option>
                  <option value="SUSPENDED">Suspended only</option>
                </select>
              </div>
            </div>

            <button type="submit" className="w-full px-4 py-3 rounded-xl bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-canopy transition-colors">
              Send Broadcast
            </button>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}
