import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { getMonthlyReportSummary } from '@/lib/services'
import { formatZAR, formatMonth, MONTHS } from '@xxm/utils'
import { Breadcrumb, PageHeader, Card, CardHeader, CardBody, ProgressBar } from '@xxm/ui'

export const metadata: Metadata = { title: 'Reports' }

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>
}) {
  const session = await auth()
  const roles   = (session!.user.roles as string[] | undefined) ?? []
  const now     = new Date()
  const params  = await searchParams

  const month = Math.min(12, Math.max(1, parseInt(params.month ?? String(now.getMonth() + 1), 10)))
  const year  = Math.max(2024, parseInt(params.year ?? String(now.getFullYear()), 10))

  const summary = await getMonthlyReportSummary(roles, month, year)

  const yearOpts = [now.getFullYear() - 1, now.getFullYear()]

  const statusGroups: Record<string, number> = {}
  for (const c of summary.contributions) {
    statusGroups[c.status] = (statusGroups[c.status] ?? 0) + 1
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin', href: '/' }, { label: 'Reports' }]} />
      <PageHeader title="Reports" subtitle="Monthly contribution summaries." />

      {/* Period selector */}
      <form method="GET" action="/reports" className="flex flex-wrap gap-2">
        <select name="month" defaultValue={month} className="rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25">
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <select name="year" defaultValue={year} className="rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25">
          {yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button type="submit" className="px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-medium hover:bg-xxm-canopy transition-colors">View</button>
      </form>

      <h2 className="text-lg font-semibold text-xxm-green-900">{formatMonth(month, year)}</h2>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Active Members',   value: summary.memberCount },
          { label: 'Total Due',        value: formatZAR(summary.totalDue) },
          { label: 'Total Collected',  value: formatZAR(summary.totalPaid) },
          { label: 'Collection Rate',  value: `${summary.collectionRate}%` },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardBody className="text-center">
              <p className="text-2xl font-bold text-xxm-green">{value}</p>
              <p className="text-xs text-xxm-gray-500 mt-1">{label}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Collection progress */}
      <Card>
        <CardHeader title="Collection Progress" />
        <CardBody className="space-y-3">
          <ProgressBar
            value={summary.collectionRate} max={100}
            variant={summary.collectionRate >= 80 ? 'success' : summary.collectionRate >= 50 ? 'warning' : 'danger'}
            animated
          />
          <p className="text-sm text-xxm-gray-500">
            {formatZAR(summary.totalPaid)} of {formatZAR(summary.totalDue)} collected ({summary.paidCount} of {summary.memberCount} members paid)
          </p>
        </CardBody>
      </Card>

      {/* Status breakdown */}
      <Card>
        <CardHeader title="Status Breakdown" />
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(statusGroups).map(([status, count]) => (
              <div key={status} className="text-center p-3 bg-xxm-gray-50 rounded-xl">
                <p className="text-xl font-bold text-xxm-green-900">{count}</p>
                <p className="text-xs text-xxm-gray-500 mt-0.5">{status}</p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
