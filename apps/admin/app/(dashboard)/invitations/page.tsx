import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { listInvitations } from '@/lib/services'
import { formatDate, formatZAR } from '@xxm/utils'
import { Breadcrumb, DataTable, type Column, RouterPagination, PageHeader } from '@xxm/ui'
import { CreateInviteModal } from '@/components/admin/CreateInviteModal'

export const metadata: Metadata = { title: 'Invitations' }

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING:  { label: 'Pending',  className: 'xxm-status-warning' },
  ACCEPTED: { label: 'Accepted', className: 'xxm-status-success' },
  EXPIRED:  { label: 'Expired',  className: 'xxm-status-danger'  },
}

type InviteRow = {
  id: string; name: string; email: string; phone: string
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
  searchParams: Promise<{ page?: string }>
}) {
  const session = await auth()
  const roles   = (session!.user.roles as string[] | undefined) ?? []
  const params  = await searchParams
  const page    = Math.max(1, parseInt(params.page ?? '1', 10))

  const { items, total } = await listInvitations(roles, page)

  type RawItem = { id: string; firstName: string; lastName: string; email: string; phone: string; status: string; minimumAmount: unknown; expiresAt: Date | null; acceptedAt: Date | null }

  const rows: InviteRow[] = (items as unknown as RawItem[]).map((inv) => {
    const sc = STATUS_CONFIG[inv.status] ?? { label: inv.status, className: 'xxm-status-pending' }
    return {
      id: inv.id, name: `${inv.firstName} ${inv.lastName}`, email: inv.email, phone: inv.phone,
      minAmount: formatZAR(inv.minimumAmount as number),
      status: sc.label, statusClass: sc.className,
      expires:  inv.expiresAt  ? formatDate(inv.expiresAt)  : '—',
      accepted: inv.acceptedAt ? formatDate(inv.acceptedAt) : '—',
    }
  })

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Invitations' }]} />
      <PageHeader title="Invitations" subtitle={`${total} total`} action={<CreateInviteModal />} />
      <DataTable columns={columns} data={rows} keyExtractor={(r) => r.id} stickyHeader striped caption="Invitations" />
      <RouterPagination totalItems={total} itemsPerPage={20} currentPage={page} baseUrl="/invitations" className="justify-center" />
    </div>
  )
}
