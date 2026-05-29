import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { listMembers } from '@/lib/services'
import { formatDate } from '@xxm/utils'
import { PageHeader, Breadcrumb, DataTable, type Column, RouterPagination } from '@xxm/ui'

export const metadata: Metadata = { title: 'Members' }

type UserStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED'

const STATUS_CONFIG: Record<UserStatus, { label: string; className: string }> = {
  ACTIVE:    { label: 'Active',    className: 'xxm-status-success' },
  PENDING:   { label: 'Pending',   className: 'xxm-status-warning' },
  SUSPENDED: { label: 'Suspended', className: 'xxm-status-danger'  },
}

type MemberRow = {
  id: string; name: string; email: string; phone: string
  status: string; statusClass: string; contribs: number; mandates: number; joined: string
}

const columns: Column<MemberRow>[] = [
  {
    key: 'name', header: 'Member', sortable: true,
    render: (r) => (
      <div>
        <p className="font-medium text-xxm-green-900">{r.name}</p>
        <p className="text-xs text-xxm-gray-400">{r.email}</p>
      </div>
    ),
  },
  { key: 'phone',    header: 'Phone',    render: (r) => <span className="font-mono text-xs">{r.phone}</span> },
  { key: 'status',   header: 'Status',   align: 'center', render: (r) => <span className={r.statusClass} role="status">{r.status}</span> },
  { key: 'contribs', header: 'Contribs', align: 'center', sortable: true },
  { key: 'mandates', header: 'Mandates', align: 'center' },
  { key: 'joined',   header: 'Joined',   sortable: true },
  {
    key: 'id', header: 'Actions', align: 'center',
    render: (r) => (
      <Link href={`/members/${r.id}`} className="text-xs text-xxm-green hover:underline font-medium">View</Link>
    ),
  },
]

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string }>
}) {
  const session = await auth()
  const roles   = (session!.user.roles as string[] | undefined) ?? []
  const params  = await searchParams
  const search  = params.search ?? undefined
  const status  = params.status as UserStatus | undefined
  const page    = Math.max(1, parseInt(params.page ?? '1', 10))

  const { items, total } = await listMembers(roles, { search, status, page, limit: 25 })

  type RawMember = {
    id: string; firstName: string; lastName: string; email: string;
    phone: string; status: string; createdAt: Date;
    _count: { contributions: number; mandates: number }
  }

  const rows: MemberRow[] = (items as unknown as RawMember[]).map((m) => {
    const sc = STATUS_CONFIG[m.status as UserStatus] ?? { label: m.status, className: 'xxm-status-info' }
    return {
      id: m.id, name: `${m.firstName} ${m.lastName}`, email: m.email,
      phone: m.phone, status: sc.label, statusClass: sc.className,
      contribs: m._count.contributions, mandates: m._count.mandates,
      joined: formatDate(m.createdAt),
    }
  })

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Members' }]} />
      <PageHeader title="Members" subtitle={`${total} total`} />

      <div className="flex flex-col gap-3">
        <form method="GET" action="/members" className="flex gap-2">
          <input type="text" name="search" defaultValue={search} placeholder="Search name, email or phone…"
            className="flex-1 min-w-0 rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm text-xxm-green-900 focus:outline-none focus:ring-2 focus:ring-xxm-green/25 bg-white" />
          {status && <input type="hidden" name="status" value={status} />}
          <button type="submit" className="px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-medium hover:bg-xxm-canopy transition-colors shrink-0">Search</button>
        </form>

        <div className="flex flex-wrap gap-1.5">
          {(['ACTIVE', 'PENDING', 'SUSPENDED'] as UserStatus[]).map((s) => {
            const active = status === s
            const href   = `/members${(() => { const p = new URLSearchParams(); if (!active) p.set('status', s); if (search) p.set('search', search); const q = p.toString(); return q ? `?${q}` : '' })()}`
            return (
              <Link key={s} href={href} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${active ? 'bg-xxm-green text-white' : 'bg-xxm-gray-100 text-xxm-gray-600 hover:bg-xxm-gray-200'}`}>
                {STATUS_CONFIG[s].label}
              </Link>
            )
          })}
          {(search || status) && (
            <Link href="/members" className="px-3 py-1.5 rounded-full text-xs font-medium bg-xxm-gray-100 text-xxm-gray-500 hover:bg-xxm-gray-200">Clear</Link>
          )}
        </div>
      </div>

      <DataTable columns={columns} data={rows} keyExtractor={(r) => r.id} stickyHeader striped caption="Member list" />
      <RouterPagination totalItems={total} itemsPerPage={25} currentPage={page} baseUrl="/members" className="justify-center" />
    </div>
  )
}
