import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { listAllContributions, bulkGenerateContributions } from '@/services/admin.service'
import { formatZAR } from '@/lib/formatters'

export const metadata: Metadata = { title: 'Contributions — Admin' }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-yellow-100 text-yellow-700' },
  PARTIAL: { label: 'Partial', className: 'bg-blue-100 text-blue-700' },
  PAID:    { label: 'Paid',    className: 'bg-green-100 text-green-700' },
  OVERDUE: { label: 'Overdue', className: 'bg-red-100 text-red-700' },
  WAIVED:  { label: 'Waived',  className: 'bg-gray-100 text-gray-500' },
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

  type ContribSummary = { amountDue: unknown; amountPaid: unknown }
  const totalDue  = (items as ContribSummary[]).reduce((s, c) => s + Number(c.amountDue), 0)
  const totalPaid = (items as ContribSummary[]).reduce((s, c) => s + Number(c.amountPaid), 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-xxm-green">Contributions</h1>
          <p className="text-sm text-gray-500 mt-1">{MONTHS[month - 1]} {year} · {total} records</p>
        </div>
      </div>

      {params.generated === '1' && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          Contributions generated successfully.
        </div>
      )}

      {/* Period + filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {MONTHS.map((name, idx) => (
            <Link
              key={name}
              href={buildUrl({ month: String(idx + 1), page: '1' })}
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
              href={buildUrl({ status: status === s ? undefined : s, page: '1' })}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                status === s ? 'bg-xxm-green text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {STATUS_CONFIG[s].label}
            </Link>
          ))}
          {status && (
            <Link href={buildUrl({ status: undefined, page: '1' })} className="px-3 py-1.5 rounded-full text-xs bg-gray-100 text-gray-500">
              Clear
            </Link>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
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

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3 text-left font-semibold">Member</th>
                <th className="px-4 py-3 text-right font-semibold">Due</th>
                <th className="px-4 py-3 text-right font-semibold">Paid</th>
                <th className="px-4 py-3 text-center font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-400">
                    No contributions for this period.
                  </td>
                </tr>
              ) : (
                (items as Array<{ id: string; amountDue: unknown; amountPaid: unknown; status: string; user: { id: string; firstName: string; lastName: string; email: string } }>).map((row) => {
                  const cfg = STATUS_CONFIG[row.status] ?? STATUS_CONFIG.PENDING
                  return (
                    <tr key={row.id} className="border-t border-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{row.user.firstName} {row.user.lastName}</p>
                        <p className="text-xs text-gray-400">{row.user.email}</p>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">{formatZAR(Number(row.amountDue))}</td>
                      <td className="px-4 py-3 text-right text-green-600">{formatZAR(Number(row.amountPaid))}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>{cfg.label}</span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={buildUrl({ page: String(page - 1) })} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">← Prev</Link>}
            {page < totalPages && <Link href={buildUrl({ page: String(page + 1) })} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">Next →</Link>}
          </div>
        </div>
      )}

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
