import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { formatZAR } from '@/lib/formatters'

export const metadata: Metadata = { title: 'Reports — Admin' }

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

type MemberRow = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  contributions: Array<{
    amountDue: number | string
    amountPaid: number | string
    status: string
  }>
}

type ContribStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'WAIVED'

const STATUS_CONFIG: Record<ContribStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-yellow-100 text-yellow-700' },
  PAID:    { label: 'Paid',    className: 'bg-green-100 text-green-700' },
  OVERDUE: { label: 'Overdue', className: 'bg-red-100 text-red-700' },
  WAIVED:  { label: 'Waived',  className: 'bg-gray-100 text-gray-500' },
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>
}) {
  const now = new Date()
  const params = await searchParams

  const month = Math.min(12, Math.max(1, Number(params.month ?? now.getMonth() + 1)))
  const year  = Math.max(2024, Number(params.year ?? now.getFullYear()))

  const [members, allContribs, poolResult] = await Promise.all([
    db.user.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        contributions: {
          where: { periodMonth: month, periodYear: year },
          select: { amountDue: true, amountPaid: true, status: true },
        },
      },
    }),
    db.contribution.findMany({
      where: { periodMonth: month, periodYear: year },
      select: { amountDue: true, amountPaid: true, status: true },
    }),
    db.contribution.aggregate({
      where: { status: 'PAID' },
      _sum: { amountPaid: true },
    }),
  ])

  type ContribSummary = { amountDue: unknown; amountPaid: unknown; status: string }
  const contribs = allContribs as unknown as ContribSummary[]
  const totalDue     = contribs.reduce((s, c) => s + Number(c.amountDue), 0)
  const totalPaid    = contribs.reduce((s, c) => s + Number(c.amountPaid), 0)
  const paidCount    = contribs.filter((c) => c.status === 'PAID').length
  const overdueCount = contribs.filter((c) => c.status === 'OVERDUE').length
  const collectionRate = contribs.length > 0
    ? Math.round((paidCount / contribs.length) * 100) : 0
  const poolTotal = Number(poolResult._sum?.amountPaid ?? 0)

  const periodLabel = `${MONTHS[month - 1]} ${year}`

  // Build month/year selectors
  const yearOptions = Array.from({ length: now.getFullYear() - 2023 }, (_, i) => 2024 + i)

  const buildUrl = (m: number, y: number) => `/admin/reports?month=${m}&year=${y}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h1 className="text-2xl font-bold text-xxm-green">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">{periodLabel}</p>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {MONTHS.map((name, idx) => (
              <Link
                key={name}
                href={buildUrl(idx + 1, year) as Route}
                className={`px-2 py-1.5 text-xs font-medium transition-colors ${
                  month === idx + 1
                    ? 'bg-xxm-green text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {name.slice(0, 3)}
              </Link>
            ))}
          </div>
          <select
            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white"
            defaultValue={year}
            onChange={undefined}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <a
            href={`/api/v1/admin/reports/csv?month=${month}&year=${year}`}
            className="px-3 py-1.5 text-xs rounded-lg bg-xxm-gold text-white font-medium hover:bg-xxm-gold/90 transition-colors whitespace-nowrap"
          >
            Export CSV
          </a>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Due',       value: formatZAR(totalDue),    className: 'text-gray-900' },
          { label: 'Total Paid',      value: formatZAR(totalPaid),   className: 'text-green-600' },
          { label: 'Outstanding',     value: formatZAR(Math.max(0, totalDue - totalPaid)), className: totalDue - totalPaid > 0 ? 'text-red-600' : 'text-green-600' },
          { label: 'Pool Total',      value: formatZAR(poolTotal),   className: 'text-xxm-green' },
        ].map(({ label, value, className }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
            <p className={`text-xl font-bold mt-1 ${className}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Collection progress */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-xxm-green">Collection Progress</h2>
          <span className="text-sm font-bold text-xxm-green">{collectionRate}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 mb-3">
          <div
            className="bg-xxm-green h-3 rounded-full transition-all"
            style={{ width: `${collectionRate}%` }}
          />
        </div>
        <div className="flex gap-6 text-sm text-gray-500">
          <span><strong className="text-green-600">{paidCount}</strong> paid</span>
          <span><strong className="text-red-500">{overdueCount}</strong> overdue</span>
          <span><strong className="text-gray-700">{contribs.length - paidCount - overdueCount}</strong> pending</span>
          <span><strong className="text-gray-700">{members.length}</strong> members total</span>
        </div>
      </div>

      {/* Member table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-xxm-green">Member Breakdown</h2>
          <span className="text-xs text-gray-400">{members.length} active members</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3 text-left font-semibold">Member</th>
                <th className="px-4 py-3 text-right font-semibold">Due</th>
                <th className="px-4 py-3 text-right font-semibold">Paid</th>
                <th className="px-4 py-3 text-right font-semibold">Outstanding</th>
                <th className="px-4 py-3 text-center font-semibold">Status</th>
                <th className="px-4 py-3 text-center font-semibold hidden md:table-cell">Statement</th>
              </tr>
            </thead>
            <tbody>
              {(members as unknown as MemberRow[]).map((m, i) => {
                const contrib = m.contributions[0]
                const amountDue  = contrib ? Number(contrib.amountDue) : 0
                const amountPaid = contrib ? Number(contrib.amountPaid) : 0
                const outstanding = Math.max(0, amountDue - amountPaid)
                const status = contrib?.status ?? 'NO_RECORD'
                const sc = STATUS_CONFIG[status as ContribStatus]

                return (
                  <tr key={m.id} className={`border-b border-gray-50 ${i % 2 === 1 ? 'bg-gray-50/40' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{m.firstName} {m.lastName}</p>
                      <p className="text-xs text-gray-400">{m.email}</p>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatZAR(amountDue)}</td>
                    <td className="px-4 py-3 text-right text-green-600 font-medium">{formatZAR(amountPaid)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${outstanding > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {formatZAR(outstanding)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {sc ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${sc.className}`}>
                          {sc.label}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      <a
                        href={`/api/v1/transactions/statement?month=${month}&year=${year}&userId=${m.id}`}
                        className="text-xs text-xxm-green hover:underline font-medium"
                        target="_blank"
                        rel="noreferrer"
                      >
                        PDF
                      </a>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
