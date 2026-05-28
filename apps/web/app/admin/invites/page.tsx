import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import {
  listInvites, createInvite, revokeInvite,
  InviteDuplicateEmailError, InviteAlreadyAcceptedError,
} from '@/services/invite.service'
import { formatDate } from '@/lib/formatters'

export const metadata: Metadata = { title: 'Invites — Admin' }

function InviteStatusBadge({ acceptedAt, expiresAt }: { acceptedAt: Date | null; expiresAt: Date }) {
  if (acceptedAt) return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Accepted</span>
  if (expiresAt < new Date()) return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Expired</span>
  return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Pending</span>
}

export default async function AdminInvitesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; error?: string; sent?: string }>
}) {
  const session = await auth()
  const roles   = (session!.user.roles as string[] | undefined) ?? []
  const params  = await searchParams
  const page    = Math.max(1, parseInt(params.page ?? '1', 10))

  const { items, total, totalPages } = await listInvites(roles, page)

  async function sendInvite(fd: FormData) {
    'use server'
    const s     = await auth()
    const r     = (s!.user.roles as string[] | undefined) ?? []
    const email = (fd.get('email') as string).trim().toLowerCase()
    const base  = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
    try {
      await createInvite(s!.user.id, r, email, base)
      redirect('/admin/invites?sent=1')
    } catch (e) {
      if (e instanceof InviteDuplicateEmailError) redirect('/admin/invites?error=duplicate')
      throw e
    }
  }

  async function revoke(fd: FormData) {
    'use server'
    const s  = await auth()
    const r  = (s!.user.roles as string[] | undefined) ?? []
    const id = fd.get('inviteId') as string
    try {
      await revokeInvite(s!.user.id, r, id)
    } catch (e) {
      if (e instanceof InviteAlreadyAcceptedError) redirect('/admin/invites?error=accepted')
      throw e
    }
    redirect('/admin/invites')
  }

  type InviteRow = {
    id: string; email: string; expiresAt: Date; acceptedAt: Date | null; createdAt: Date;
    invitedBy: { id: string; firstName: string; lastName: string };
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-xxm-green">Invites</h1>
        <p className="text-sm text-gray-500 mt-1">{total} total</p>
      </div>

      {params.sent === '1' && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          Invitation sent successfully.
        </div>
      )}
      {params.error === 'duplicate' && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          An account with that email already exists.
        </div>
      )}

      {/* Send invite form */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="font-semibold text-xxm-green mb-4">Send New Invite</h2>
        <form action={sendInvite} className="flex gap-3 items-end flex-wrap">
          <div className="flex-1 min-w-0">
            <label className="block text-xs text-gray-500 mb-1">Email address</label>
            <input
              type="email"
              name="email"
              required
              placeholder="member@example.com"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-xxm-green/30"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2 rounded-lg bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-green/90 transition-colors"
          >
            Send invite
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-2">
          Invitation expires in 72 hours. The recipient will complete registration via a secure link.
        </p>
      </div>

      {/* Invite list */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3 text-left font-semibold">Email</th>
                <th className="px-4 py-3 text-left font-semibold hidden md:table-cell">Sent by</th>
                <th className="px-4 py-3 text-left font-semibold hidden md:table-cell">Sent</th>
                <th className="px-4 py-3 text-left font-semibold">Expires</th>
                <th className="px-4 py-3 text-center font-semibold">Status</th>
                <th className="px-4 py-3 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                    No invites yet. Send the first one above.
                  </td>
                </tr>
              ) : (
                (items as InviteRow[]).map((invite, i) => (
                  <tr key={invite.id} className={`border-t border-gray-50 ${i % 2 === 1 ? 'bg-gray-50/30' : ''}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">{invite.email}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 hidden md:table-cell">
                      {invite.invitedBy.firstName} {invite.invitedBy.lastName}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 hidden md:table-cell">
                      {formatDate(invite.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {formatDate(invite.expiresAt)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <InviteStatusBadge acceptedAt={invite.acceptedAt} expiresAt={invite.expiresAt} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {!invite.acceptedAt && (
                        <form action={revoke}>
                          <input type="hidden" name="inviteId" value={invite.id} />
                          <button
                            type="submit"
                            className="px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium"
                          >
                            Revoke
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && <a href={`/admin/invites?page=${page - 1}`} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">← Prev</a>}
            {page < totalPages && <a href={`/admin/invites?page=${page + 1}`} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Next →</a>}
          </div>
        </div>
      )}
    </div>
  )
}
