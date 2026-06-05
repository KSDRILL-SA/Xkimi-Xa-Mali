import type { Metadata } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listInvitations, revokeInvitation } from '@/lib/services'
import { formatDate, formatZAR } from '@xxm/utils'
import { Breadcrumb, DataTable, type Column, RouterPagination, PageHeader } from '@xxm/ui'
import { CreateInviteModal } from '@/components/admin/CreateInviteModal'

export const metadata: Metadata = { title: 'Invitations' }

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING:  { label: 'Pending',  className: 'xxm-status-warning' },
  ACCEPTED: { label: 'Accepted', className: 'xxm-status-success' },
  EXPIRED:  { label: 'Expired',  className: 'xxm-status-danger'  },
  REVOKED:  { label: 'Revoked',  className: 'xxm-status-danger'  },
}

type InviteRow = {
  id: string; name: string; email: string; phone: string; rawStatus: string
  status: string; statusClass: string; minAmount: string; expires: string; accepted: string
}

const columns: Column<InviteRow>[] = [
  {
    key: 'name', header: 'Invited Person', sortable: true,
    render: (r) => (
      <div>
        <p className="font-medium text-xxm-green-900">{r.name}</p>
        <p className="text-xs text-xxm-gray-400">{r.email}</p>
      </div>
    ),
  },
  { key: 'phone',     header: 'Phone',   render: (r) => <span className="font-mono text-xs">{r.phone}</span> },
  { key: 'minAmount', header: 'Min/mo',  align: 'right' },
  { key: 'status',    header: 'Status',  align: 'center', render: (r) => <span className={r.statusClass}>{r.status}</span> },
  { key: 'expires',   header: 'Expires' },
  { key: 'accepted',  header: 'Accepted' },
]

export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; revoked?: string }>
}) {
  const session = await auth()
  const roles   = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')
  const params  = await searchParams
  const page    = Math.max(1, parseInt(params.page ?? '1', 10))
  const revoked = params.revoked === '1'

  const { items, total } = await listInvitations(roles, page)

  type RawItem = { id: string; firstName: string; lastName: string; email: string; phone: string; status: string; minimumAmount: unknown; expiresAt: Date | null; acceptedAt: Date | null }

  const rows: InviteRow[] = (items as unknown as RawItem[]).map((inv) => {
    const sc = STATUS_CONFIG[inv.status] ?? { label: inv.status, className: 'xxm-status-pending' }
    return {
      id: inv.id, name: `${inv.firstName} ${inv.lastName}`, email: inv.email, phone: inv.phone,
      rawStatus: inv.status,
      minAmount: formatZAR(inv.minimumAmount as number),
      status: sc.label, statusClass: sc.className,
      expires:  inv.expiresAt  ? formatDate(inv.expiresAt)  : '—',
      accepted: inv.acceptedAt ? formatDate(inv.acceptedAt) : '—',
    }
  })

  const columnsWithActions: Column<InviteRow>[] = [
    ...columns,
    {
      key: 'id', header: 'Actions', align: 'center',
      render: (r) => {
        if (r.rawStatus !== 'PENDING') return null
        return (
          <form action={async () => {
            'use server'
            const s = await auth()
            if (!s?.user?.id) redirect('/login')
            const sr = (s.user.roles as string[] | undefined) ?? []
            if (!sr.includes('ADMIN')) redirect('/forbidden')
            await revokeInvitation(s.user.id, sr, r.id)
            revalidatePath('/invitations')
          }}>
            <button type="submit" className="text-xs text-red-500 hover:underline font-medium">
              Revoke
            </button>
          </form>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Invitations' }]} />
      <PageHeader title="Invitations" subtitle={`${total} total`} action={<CreateInviteModal />} />

      {revoked && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 font-medium">
          Invitation revoked successfully.
        </div>
      )}

      <DataTable columns={columnsWithActions} data={rows} keyExtractor={(r) => r.id} stickyHeader striped caption="Invitations" />
      <RouterPagination totalItems={total} itemsPerPage={20} currentPage={page} baseUrl="/invitations" className="justify-center" />
    </div>
  )
}
