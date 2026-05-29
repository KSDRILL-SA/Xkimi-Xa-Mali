import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listInvitations, revokeInvitation, InviteUsedError, InviteRevokedError } from '@/services/invite.service'
import { formatDate } from '@/lib/formatters'
import { CreateInviteModal } from '@/components/admin/CreateInviteModal'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { RouterPagination } from '@/components/ui/RouterPagination'

export const metadata: Metadata = { title: 'Invitations — Admin' }

type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED'

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING:  { label: 'Pending',  className: 'xxm-status-warning' },
  ACCEPTED: { label: 'Accepted', className: 'xxm-status-success' },
  REVOKED:  { label: 'Revoked',  className: 'xxm-status-danger'  },
  EXPIRED:  { label: 'Expired',  className: 'xxm-status-info'    },
}

function InviteStatusBadge({ status, expiresAt }: { status: InvitationStatus; expiresAt: Date }) {
  const resolved = status === 'PENDING' && expiresAt < new Date() ? 'EXPIRED' : status
  const cfg = STATUS_CONFIG[resolved] ?? STATUS_CONFIG.PENDING
  return (
    <span className={cfg.className} role="status">{cfg.label}</span>
  )
}

type InviteRow = {
  id: string
  codePrefix: string
  firstName: string
  lastName: string
  email: string
  phone: string
  minimumAmount: unknown
  status: InvitationStatus
  expiresAt: Date
  acceptedAt: Date | null
  createdAt: Date
  invitedBy: { id: string; firstName: string; lastName: string }
}

export default async function AdminInvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; error?: string }>
}) {
  const session = await auth()
  const roles   = (session!.user.roles as string[] | undefined) ?? []
  const sp      = await searchParams
  const page    = Math.max(1, parseInt(sp.page ?? '1', 10))

  const { items, total, totalPages } = await listInvitations(roles, page)

  async function revoke(fd: FormData) {
    'use server'
    const s  = await auth()
    const r  = (s!.user.roles as string[] | undefined) ?? []
    const id = fd.get('inviteId') as string
    try {
      await revokeInvitation(s!.user.id, r, id)
    } catch (e) {
      if (e instanceof InviteUsedError)    redirect('/admin/invitations?error=accepted')
      if (e instanceof InviteRevokedError) redirect('/admin/invitations?error=revoked')
      throw e
    }
    redirect('/admin/invitations')
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <Breadcrumb items={[{ label: 'Admin', href: '/admin' }, { label: 'Invitations' }]} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-xxm-green">Invitations</h1>
          <p className="text-sm text-xxm-gray-500 mt-1">{total} total</p>
        </div>
        <CreateInviteModal />
      </div>

      {sp.error === 'accepted' && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          This invitation has already been accepted.
        </div>
      )}
      {sp.error === 'revoked' && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
          This invitation is already revoked.
        </div>
      )}

      <div className="bg-white rounded-xl border border-xxm-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-xxm-gray-50 text-xs uppercase tracking-wider text-xxm-gray-500">
                <th className="px-4 py-3 text-left font-semibold">Name / Email</th>
                <th className="px-4 py-3 text-left font-semibold hidden lg:table-cell">Phone</th>
                <th className="px-4 py-3 text-left font-semibold hidden md:table-cell">Code prefix</th>
                <th className="px-4 py-3 text-right font-semibold hidden md:table-cell">Min. amount</th>
                <th className="px-4 py-3 text-left font-semibold hidden lg:table-cell">Sent by</th>
                <th className="px-4 py-3 text-left font-semibold hidden md:table-cell">Expires</th>
                <th className="px-4 py-3 text-center font-semibold">Status</th>
                <th className="px-4 py-3 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-xxm-gray-50">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-xxm-gray-400">
                    No invitations yet. Create the first one above.
                  </td>
                </tr>
              ) : (
                (items as InviteRow[]).map((inv, i) => (
                  <tr key={inv.id} className={`hover:bg-xxm-green-50/30 transition-colors ${i % 2 === 1 ? 'bg-xxm-gray-50/30' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-xxm-gray-900">{inv.firstName} {inv.lastName}</p>
                      <p className="text-xs text-xxm-gray-500">{inv.email}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-xxm-gray-600 hidden lg:table-cell">{inv.phone}</td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="font-mono text-xs text-xxm-gray-700 bg-xxm-gray-100 px-2 py-0.5 rounded">
                        XKM-{inv.codePrefix}…
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-xxm-gray-600 hidden md:table-cell tabular-nums">
                      R{Number(inv.minimumAmount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-xs text-xxm-gray-500 hidden lg:table-cell">
                      {inv.invitedBy.firstName} {inv.invitedBy.lastName}
                    </td>
                    <td className="px-4 py-3 text-xs text-xxm-gray-500 hidden md:table-cell">
                      {formatDate(inv.expiresAt)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <InviteStatusBadge status={inv.status} expiresAt={inv.expiresAt} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {inv.status === 'PENDING' && inv.expiresAt >= new Date() && (
                        <form action={revoke}>
                          <input type="hidden" name="inviteId" value={inv.id} />
                          <button
                            type="submit"
                            className="px-3 py-1.5 text-xs rounded-lg bg-red-50 text-red-700 hover:bg-red-100 font-semibold border border-red-200 transition-colors min-h-[32px]"
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

      <RouterPagination totalItems={total} itemsPerPage={25} currentPage={page} baseUrl="/admin/invitations" className="justify-center" />
    </div>
  )
}
