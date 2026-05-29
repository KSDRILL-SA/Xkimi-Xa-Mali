import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { formatZAR } from '@/lib/formatters'
import { BarChart3, Target, Wallet, Users, FileText } from 'lucide-react'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { ProgressBar } from '@/components/ui/ProgressBar'

export const metadata: Metadata = { title: 'Admin — Xkimm Xa Mali' }

export default async function AdminOverviewPage() {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const [memberCount, activeContribs, poolResult, pendingMandates] = await Promise.all([
    db.user.count({ where: { status: 'ACTIVE' } }),
    db.contribution.findMany({
      where: { periodMonth: month, periodYear: year },
      select: { amountDue: true, amountPaid: true, status: true },
    }),
    db.contribution.aggregate({
      where: { status: 'PAID' },
      _sum: { amountPaid: true },
    }),
    db.paymentMandate.count({ where: { status: 'PENDING' } }),
  ])

  type ContribSummary = { amountDue: unknown; amountPaid: unknown; status: string }
  const contribs = activeContribs as ContribSummary[]
  const totalDue  = contribs.reduce((s, c) => s + Number(c.amountDue), 0)
  const totalPaid = contribs.reduce((s, c) => s + Number(c.amountPaid), 0)
  const paidCount = contribs.filter((c) => c.status === 'PAID').length
  const collectionRate = contribs.length > 0
    ? Math.round((paidCount / contribs.length) * 100) : 0
  const poolTotal = Number(poolResult._sum?.amountPaid ?? 0)

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

  const statCards = [
    { label: 'Active Members',   value: memberCount,          sub: 'registered accounts',  Icon: Users },
    { label: 'Pool Total',       value: formatZAR(poolTotal), sub: 'all-time collected',   Icon: Wallet },
    { label: 'Collection Rate',  value: `${collectionRate}%`, sub: `${MONTHS[month - 1]} ${year}`, Icon: BarChart3 },
    { label: 'Pending Mandates', value: pendingMandates,      sub: 'awaiting approval',    Icon: FileText },
  ]

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: 'Admin' }]} />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-xxm-green">Admin Overview</h1>
          <p className="text-sm text-xxm-gray-500 mt-1">{MONTHS[month - 1]} {year}</p>
        </div>
        <Link
          href="/admin/reports"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-medium hover:bg-xxm-canopy transition-colors self-start sm:self-auto"
        >
          <FileText size={14} aria-hidden />
          Full Reports
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, sub, Icon }) => (
          <div key={label} className="bg-white rounded-xl border border-xxm-gray-100 p-4 card-hover">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-7 h-7 rounded-lg bg-xxm-green-50 flex items-center justify-center shrink-0">
                <Icon size={14} className="text-xxm-green" aria-hidden />
              </span>
              <p className="text-xs text-xxm-gray-500 uppercase tracking-wider font-semibold">{label}</p>
            </div>
            <p className="text-2xl font-bold text-xxm-green">{value}</p>
            <p className="text-xs text-xxm-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* This month summary */}
      <div className="bg-white rounded-xl border border-xxm-gray-100 p-5">
        <h2 className="font-semibold text-xxm-green mb-4">This Month — {MONTHS[month - 1]} {year}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
          <div>
            <p className="text-xxm-gray-500 text-xs uppercase tracking-wide font-medium">Total Due</p>
            <p className="font-bold text-xxm-gray-900 text-lg mt-0.5 tabular-nums">{formatZAR(totalDue)}</p>
          </div>
          <div>
            <p className="text-xxm-gray-500 text-xs uppercase tracking-wide font-medium">Total Paid</p>
            <p className="font-bold text-green-600 text-lg mt-0.5 tabular-nums">{formatZAR(totalPaid)}</p>
          </div>
          <div>
            <p className="text-xxm-gray-500 text-xs uppercase tracking-wide font-medium">Outstanding</p>
            <p className={`font-bold text-lg mt-0.5 tabular-nums ${totalDue - totalPaid > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatZAR(Math.max(0, totalDue - totalPaid))}
            </p>
          </div>
        </div>

        <ProgressBar
          value={collectionRate}
          label={`${paidCount} of ${activeContribs.length} members paid`}
          showValue
          size="md"
          variant="default"
        />
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { href: '/admin/reports',  label: 'Monthly Reports', Icon: BarChart3, sub: 'View and export reports' },
          { href: '/admin/goals',    label: 'Manage Goals',    Icon: Target,    sub: 'Group savings goals' },
          { href: '/admin/mandates', label: 'Mandates',        Icon: Wallet,    sub: 'Approve DebiCheck mandates' },
        ].map(({ href, label, Icon, sub }) => (
          <Link
            key={href}
            href={href as Route}
            className="bg-white rounded-xl border border-xxm-gray-100 p-4 flex items-center gap-3 card-hover group"
          >
            <span className="w-10 h-10 rounded-xl bg-xxm-green-50 flex items-center justify-center shrink-0 group-hover:bg-xxm-green transition-colors">
              <Icon size={18} className="text-xxm-green group-hover:text-white transition-colors" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-xxm-gray-700 group-hover:text-xxm-green transition-colors">{label}</p>
              <p className="text-xs text-xxm-gray-400 mt-0.5">{sub}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
