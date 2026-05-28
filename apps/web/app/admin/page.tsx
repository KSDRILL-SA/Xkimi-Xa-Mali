import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { db } from '@/lib/db'
import { formatZAR } from '@/lib/formatters'
import { BarChart3, Target, Wallet, FileText } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'

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
    { label: 'Active Members', value: memberCount, sub: 'registered accounts' },
    { label: 'Pool Total', value: formatZAR(poolTotal), sub: 'all-time collected' },
    { label: 'Collection Rate', value: `${collectionRate}%`, sub: `${MONTHS[month - 1]} ${year}` },
    { label: 'Pending Mandates', value: pendingMandates, sub: 'awaiting approval' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Admin Overview"
        subtitle={`${MONTHS[month - 1]} ${year}`}
        action={
          <Link
            href="/admin/reports"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-medium hover:bg-xxm-canopy transition-colors"
          >
            <FileText size={14} aria-hidden />
            Full Reports
          </Link>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, sub }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{label}</p>
            <p className="text-2xl font-bold text-xxm-green mt-1">{value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* This month summary */}
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <h2 className="font-semibold text-xxm-green mb-4">This Month — {MONTHS[month - 1]} {year}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500 text-xs">Total Due</p>
            <p className="font-bold text-gray-900 text-lg mt-0.5">{formatZAR(totalDue)}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Total Paid</p>
            <p className="font-bold text-green-600 text-lg mt-0.5">{formatZAR(totalPaid)}</p>
          </div>
          <div>
            <p className="text-gray-500 text-xs">Outstanding</p>
            <p className={`font-bold text-lg mt-0.5 ${totalDue - totalPaid > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatZAR(Math.max(0, totalDue - totalPaid))}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>{paidCount} of {activeContribs.length} members paid</span>
            <span>{collectionRate}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className="bg-xxm-green h-2 rounded-full transition-all"
              style={{ width: `${collectionRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { href: '/admin/reports',          label: 'Monthly Reports', Icon: BarChart3 },
          { href: '/dashboard/goals',        label: 'Manage Goals',    Icon: Target },
          { href: '/dashboard/contributions',label: 'Contributions',   Icon: Wallet },
        ].map(({ href, label, Icon }) => (
          <Link
            key={href}
            href={href as Route}
            className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-3 hover:border-xxm-green/30 hover:shadow-xxm-sm transition-all group"
          >
            <span className="w-9 h-9 rounded-lg bg-xxm-green-50 flex items-center justify-center shrink-0 group-hover:bg-xxm-green group-hover:text-white transition-colors">
              <Icon size={18} className="text-xxm-green group-hover:text-white transition-colors" aria-hidden />
            </span>
            <span className="text-sm font-medium text-gray-700 group-hover:text-xxm-green transition-colors">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
