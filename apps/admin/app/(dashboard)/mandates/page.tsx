import type { Metadata } from 'next'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { listAllMandates, approveMandate, rejectMandate } from '@/lib/services'
import { formatZAR, formatDate } from '@xxm/utils'
import { Breadcrumb, DataTable, type Column, RouterPagination, PageHeader } from '@xxm/ui'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Mandates' }

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ACTIVE:    { label: 'Active',    className: 'xxm-status-success' },
  PENDING:   { label: 'Pending',   className: 'xxm-status-warning' },
  SUSPENDED: { label: 'Suspended', className: 'xxm-status-warning' },
  CANCELLED: { label: 'Cancelled', className: 'xxm-status-danger'  },
}

type MandateRow = {
  id: string; member: string; email: string; bank: string
  amount: string; debitDay: number; status: string; statusClass: string; createdAt: string
}

const columns: Column<MandateRow>[] = [
  {
    key: 'member', header: 'Member', sortable: true,
    render: (r) => (
      <div>
        <p className="font-medium text-xxm-green-900">{r.member}</p>
        <p className="text-xs text-xxm-gray-400">{r.email}</p>
      </div>
    ),
  },
  { key: 'bank',     header: 'Bank' },
  { key: 'amount',   header: 'Amount',   align: 'right' },
  { key: 'debitDay', header: 'Debit Day',align: 'center' },
  { key: 'status',   header: 'Status',   align: 'center', render: (r) => <span className={r.statusClass}>{r.status}</span> },
  { key: 'createdAt',header: 'Created' },
  {
    key: 'id', header: 'Actions', align: 'center',
    render: (r) => (
      <div className="flex items-center gap-2 justify-center">
        {r.status === 'PENDING' && (
          <>
            <form action={async () => { 'use server'; const s = await auth(); await approveMandate(s!.user.id, s!.user.roles as string[], r.id); revalidatePath('/mandates') }}>
              <button type="submit" className="text-xs text-xxm-green hover:underline font-medium">Approve</button>
            </form>
            <form action={async () => { 'use server'; const s = await auth(); await rejectMandate(s!.user.id, s!.user.roles as string[], r.id); revalidatePath('/mandates') }}>
              <button type="submit" className="text-xs text-red-600 hover:underline font-medium">Reject</button>
            </form>
          </>
        )}
        <Link href={`/members/${r.id}`} className="text-xs text-xxm-gray-400 hover:text-xxm-green">View</Link>
      </div>
    ),
  },
]

export default async function MandatesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const session = await auth()
  const roles   = (session!.user.roles as string[] | undefined) ?? []
  const params  = await searchParams
  const status  = params.status ?? undefined
  const page    = Math.max(1, parseInt(params.page ?? '1', 10))

  const { items, total } = await listAllMandates(roles, { status, page, limit: 20 })

  type RawItem = { id: string; status: string; amount: unknown; debitDay: number; createdAt: Date; user: { id: string; firstName: string; lastName: string; email: string }; bankAccount: { bankName: string; accountType: string } | null }

  const rows: MandateRow[] = (items as unknown as RawItem[]).map((m) => {
    const sc = STATUS_CONFIG[m.status] ?? { label: m.status, className: 'xxm-status-pending' }
    return {
      id: m.user.id, member: `${m.user.firstName} ${m.user.lastName}`, email: m.user.email,
      bank: m.bankAccount ? `${m.bankAccount.bankName} · ${m.bankAccount.accountType}` : 'Unknown',
      amount: formatZAR(m.amount as number), debitDay: m.debitDay,
      status: sc.label, statusClass: sc.className, createdAt: formatDate(m.createdAt),
    }
  })

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Mandates' }]} />
      <PageHeader title="Mandates" subtitle={`${total} total`} />

      <form method="GET" action="/mandates" className="flex flex-wrap gap-2">
        <select name="status" defaultValue={status ?? ''} className="rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25">
          <option value="">All statuses</option>
          {Object.entries(STATUS_CONFIG).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <button type="submit" className="px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-medium hover:bg-xxm-canopy transition-colors">Filter</button>
        {status && <Link href="/mandates" className="px-4 py-2 rounded-xl border border-xxm-gray-200 text-sm text-xxm-gray-500 hover:bg-xxm-gray-50">Clear</Link>}
      </form>

      <DataTable columns={columns} data={rows} keyExtractor={(r) => r.id} stickyHeader striped caption="Mandates" />
      <RouterPagination totalItems={total} itemsPerPage={20} currentPage={page} baseUrl={`/mandates${status ? `?status=${status}` : ''}`} className="justify-center" />
    </div>
  )
}
