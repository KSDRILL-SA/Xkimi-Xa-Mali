import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listAllContributions } from '@/lib/services'
import { formatZAR, MONTHS } from '@xxm/utils'
import { Breadcrumb, DataTable, type Column, RouterPagination, Alert } from '@xxm/ui'
import { db } from '@/lib/db'

export const metadata: Metadata = { title: 'Contributions' }

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'xxm-status-warning' },
  PARTIAL: { label: 'Partial', className: 'xxm-status-pending' },
  PAID:    { label: 'Paid',    className: 'xxm-status-success'  },
  OVERDUE: { label: 'Overdue', className: 'xxm-status-danger'   },
  WAIVED:  { label: 'Waived',  className: 'xxm-status-info'     },
}

type ContribRow = {
  id: string; member: string; email: string
  period: string; due: string; paid: string
  status: string; statusClass: string
}

const columns: Column<ContribRow>[] = [
  {
    key: 'member', header: 'Member', sortable: true,
    render: (r) => (
      <div>
        <p className="font-medium text-xxm-green-900">{r.member}</p>
        <p className="text-xs text-xxm-gray-400">{r.email}</p>
      </div>
    ),
  },
  { key: 'period', header: 'Period' },
  { key: 'due',    header: 'Due',   align: 'right' },
  { key: 'paid',   header: 'Paid',  align: 'right' },
  { key: 'status', header: 'Status', align: 'center', render: (r) => <span className={r.statusClass}>{r.status}</span> },
]

export default async function ContributionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; status?: string; page?: string; generated?: string }>
}) {
  const session = await auth()
  const roles   = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')
  const now     = new Date()
  const params  = await searchParams

  const month  = Math.min(12, Math.max(1, parseInt(params.month ?? String(now.getMonth() + 1), 10)))
  const year   = Math.max(2024, parseInt(params.year ?? String(now.getFullYear()), 10))
  const status = params.status ?? undefined
  const page   = Math.max(1, parseInt(params.page ?? '1', 10))
  const generated = params.generated === '1'

  const { items, total } = await listAllContributions(roles, { month, year, status, page, limit: 25 })

  async function generate(fd: FormData) {
    'use server'
    const s = await auth()
    if (!s?.user?.id) redirect('/login')
    const r = (s.user.roles as string[] | undefined) ?? []
    if (!r.includes('ADMIN')) redirect('/forbidden')
    const m = parseInt(fd.get('month') as string, 10)
    const y = parseInt(fd.get('year')  as string, 10)

    const activeMembers = await db.user.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        mandates: {
          where: { status: 'ACTIVE' },
          select: { debitDay: true, amount: true },
          take: 1,
        },
      },
    })
    await Promise.all(activeMembers.map((member) => {
      const mandate = member.mandates[0]
      const debitDay = mandate?.debitDay ?? 1
      const amountDue = mandate?.amount ?? 100
      const dueDate = new Date(y, m - 1, debitDay)
      return db.contribution.upsert({
        where: { userId_periodMonth_periodYear: { userId: member.id, periodMonth: m, periodYear: y } },
        create: {
          userId: member.id,
          periodMonth: m,
          periodYear: y,
          amountDue,
          amountPaid: 0,
          dueDate,
          status: 'PENDING',
        },
        update: {},
      })
    }))
    redirect(`/contributions?month=${m}&year=${y}&generated=1`)
  }

  type RawItem = { id: string; periodMonth: number; periodYear: number; amountDue: unknown; amountPaid: unknown; status: string; user: { firstName: string; lastName: string; email: string } }

  const rows: ContribRow[] = (items as unknown as RawItem[]).map((c) => {
    const sc = STATUS_CONFIG[c.status] ?? { label: c.status, className: 'xxm-status-pending' }
    return {
      id: c.id, member: `${c.user.firstName} ${c.user.lastName}`, email: c.user.email,
      period: `${MONTHS[c.periodMonth - 1]} ${c.periodYear}`,
      due:  formatZAR(c.amountDue as number), paid: formatZAR(c.amountPaid as number),
      status: sc.label, statusClass: sc.className,
    }
  })

  const yearOpts = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Contributions' }]} />

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-xxm-green">Contributions</h1>
          <p className="text-sm text-xxm-gray-500 mt-1">{total} records for {MONTHS[month - 1]} {year}</p>
        </div>
        <form action={generate} className="flex items-center gap-2">
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="year"  value={year}  />
          <button type="submit" className="px-4 py-2 rounded-xl bg-xxm-gold text-xxm-green-900 text-sm font-semibold hover:bg-xxm-gold-dark transition-colors">
            Generate {MONTHS[month - 1]}
          </button>
        </form>
      </div>

      {generated && <Alert variant="success" title="Generated">Contributions generated for {MONTHS[month - 1]} {year}.</Alert>}

      {/* Filters */}
      <form method="GET" action="/contributions" className="flex flex-wrap gap-2">
        <select name="month" defaultValue={month} className="rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25">
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select name="year" defaultValue={year} className="rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25">
          {yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select name="status" defaultValue={status ?? ''} className="rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25">
          <option value="">All statuses</option>
          {Object.entries(STATUS_CONFIG).map(([v, { label }]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <button type="submit" className="px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-medium hover:bg-xxm-canopy transition-colors">Filter</button>
      </form>

      <DataTable columns={columns} data={rows} keyExtractor={(r) => r.id} stickyHeader striped caption="Contributions" />
      <RouterPagination totalItems={total} itemsPerPage={25} currentPage={page} baseUrl={`/contributions?month=${month}&year=${year}${status ? `&status=${status}` : ''}`} className="justify-center" />
    </div>
  )
}
