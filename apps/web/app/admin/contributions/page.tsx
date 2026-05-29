import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listAllContributions, bulkGenerateContributions } from '@/services/admin.service'
import { formatZAR } from '@/lib/formatters'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { RouterPagination } from '@/components/ui/RouterPagination'

export const metadata: Metadata = { title: 'Contributions — Admin' }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'xxm-status-warning' },
  PARTIAL: { label: 'Partial', className: 'xxm-status-pending' },
  PAID:    { label: 'Paid',    className: 'xxm-status-success' },
  OVERDUE: { label: 'Overdue', className: 'xxm-status-danger'  },
  WAIVED:  { label: 'Waived',  className: 'xxm-status-info'    },
}

export default async function AdminContributionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; status?: string; page?: string; generated?: string }>
}) {
  const session = await auth()
  const roles   = (session!.user.roles as string[] | undefined) ?? []
  const now     = new Date()
  const params  = await searchParams

  const month  = Math.min(12, Math.max(1, parseInt(params.month ?? String(now.getMonth() + 1), 10)))
  const year   = Math.max(2024, parseInt(params.year ?? String(now.getFullYear()), 10))
  const status = params.status ?? undefined
  const page   = Math.max(1, parseInt(params.page ?? '1', 10))

  const { items, total, totalPages } = await listAllContributions(roles, { month, year, status, page, limit: 25 })

  async function generate(fd: FormData) {
    'use server'
    const s    = await auth()
    const r    = (s!.user.roles as string[] | undefined) ?? []
    const m = parseInt(fd.get('month') as string, 10)
    const y = parseInt(fd.get('year')  as string, 10)
    await bulkGenerateContributions(s!.user.id, r, m, y)
    redirect(`/admin/contributions?month=${m}&year=${y}&generated=1`)
  }

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { month: String(month), year: String(year), status, page: String(page), ...overrides }
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v) })
    return `/admin/contributions?${p.toString()}`
  }

  type RawContrib = { id: string; amountDue: unknown; amountPaid: unknown; status: string; user: { id: string; firstName: string; lastName: string; email: string } }
  const rawItems = items as unknown as RawContrib[]

  const totalDue  = rawItems.reduce((s, c) => s + Number(c.amountDue), 0)
  const totalPaid = rawItems.reduce((s, c) => s + Number(c.amountPaid), 0)

  type ContribRow = { id: string; member: string; email: string; due: string; paid: string; status: string; statusClass: string }

  const contribColumns: Column<ContribRow>[] = [
    {
      key: 'member',
      header: 'Member',
      sortable: true,
      render: (r) => (
        <div>
          <p className="font-medium text-xxm-green-900">{r.member}</p>
          <p className="text-xs text-xxm-gray-400">{r.email}</p>
        </div>
      ),
    },
    { key: 'due',    header: 'Due',    align: 'right', render: (r) => <span className="tabular-nums">{r.due}</span> },
    { key: 'paid',   header: 'Paid',   align: 'right', render: (r) => <span className="tabular-nums text-xxm-green-600 font-medium">{r.paid}</span> },
    { key: 'status', header: 'Status', align: 'center', render: (r) => <span className={r.statusClass} role="status">{r.status}</span> },
  ]

  const contribRows: ContribRow[] = rawItems.map((row) => {
    const cfg = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.PENDING
    return {
      id:          row.id,
      member:      `${row.user.firstName} ${row.user.lastName}`,
      email:       row.user.email,
      due:         formatZAR(Number(row.amountDue)),
      paid:        formatZAR(Number(row.amountPaid)),
      status:      cfg.label,
      statusClass: cfg.className,
    }
  })

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/admin' }, { label: 'Contributions' }]} />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-xxm-green">Contributions</h1>
          <p className="text-sm text-xxm-gray-500 mt-1">{MONTHS[month - 1]} {year} · {total} records</p>
        </div>
      </div>

      {params.generated === '1' && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          Contributions generated successfully.
        </div>
      )}

      {/* Period + filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex rounded-lg border border-gray-200 overflow-x-auto scrollbar-none text-xs flex-nowrap">
          {MONTHS.map((name, idx) => (
            <Link
              key={name}
              href={buildUrl({ month: String(idx + 1), page: '1' }) as Route}
              className={`px-2 py-1.5 font-medium transition-colors ${
                month === idx + 1 ? 'bg-xxm-green text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {name.slice(0, 3)}
            </Link>
          ))}
        </div>
        <select
          className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white"
          defaultValue={year}
        >
          {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <div className="flex gap-1.5 ml-2">
          {(Object.keys(STATUS_CONFIG) as string[]).map((s) => (
            <Link
              key={s}
              href={buildUrl({ status: status === s ? undefined : s, page: '1' }) as Route}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                status === s ? 'bg-xxm-green text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {STATUS_CONFIG[s].label}
            </Link>
          ))}
          {status && (
            <Link href={buildUrl({ status: undefined, page: '1' }) as Route} className="px-3 py-1.5 rounded-full text-xs bg-gray-100 text-gray-500">
              Clear
            </Link>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Due',    value: formatZAR(totalDue),    cls: 'text-gray-900' },
          { label: 'Total Paid',   value: formatZAR(totalPaid),   cls: 'text-green-600' },
          { label: 'Outstanding',  value: formatZAR(Math.max(0, totalDue - totalPaid)), cls: totalDue - totalPaid > 0 ? 'text-red-600' : 'text-green-600' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
            <p className={`text-xl font-bold mt-1 ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      <DataTable
        columns={contribColumns}
        data={contribRows}
        keyExtractor={(r) => r.id}
        striped
        caption={`Contributions for ${MONTHS[month - 1]} ${year}`}
        emptyState={<div className="py-12 text-center text-xxm-gray-400 text-sm">No contributions for this period.</div>}
      />

      <RouterPagination totalItems={total} itemsPerPage={25} currentPage={page} baseUrl="/admin/contributions" className="justify-center" />

      {/* Bulk generate */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="font-semibold text-xxm-green mb-4">Bulk Generate Contributions</h2>
        <form action={generate} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Month</label>
            <select name="month" defaultValue={month} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white">
              {MONTHS.map((name, idx) => <option key={name} value={idx + 1}>{name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Year</label>
            <select name="year" defaultValue={year} className="border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 bg-white">
              {[2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button type="submit" className="px-4 py-2 rounded-lg bg-xxm-green text-white text-sm font-medium hover:bg-xxm-green/90">
            Generate
          </button>
        </form>
        <p className="text-xs text-gray-400 mt-2">Only generates for active members with an active mandate. Existing records for the period are skipped.</p>
      </div>
    </div>
  )
}
