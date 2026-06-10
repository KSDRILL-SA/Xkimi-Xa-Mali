import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { getMonthlyReportSummary } from '@/lib/services'
import { formatZAR, formatMonth, MONTHS } from '@xxm/utils'
import { ProgressBar, Reveal } from '@xxm/ui'
import { Download, TrendingUp, Users, Wallet, BarChart3, ChevronDown, CheckCircle2 } from 'lucide-react'

export const metadata: Metadata = { title: 'Reports' }

const STATUS_STYLES: Record<string, { badge: string; dot: string }> = {
  PAID:    { badge: 'bg-xxm-green-100 text-xxm-green-700',  dot: 'bg-xxm-green' },
  PARTIAL: { badge: 'bg-sky-100 text-sky-700',              dot: 'bg-sky-500'  },
  PENDING: { badge: 'bg-amber-100 text-amber-700',          dot: 'bg-amber-500' },
  OVERDUE: { badge: 'bg-red-100 text-red-700',              dot: 'bg-red-500'   },
  WAIVED:  { badge: 'bg-xxm-gray-100 text-xxm-gray-600',   dot: 'bg-xxm-gray-400' },
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>
}) {
  const session = await auth()
  const roles   = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')

  const now    = new Date()
  const params = await searchParams

  const month = Math.min(12, Math.max(1, parseInt(params.month ?? String(now.getMonth() + 1), 10)))
  const year  = Math.max(2024, parseInt(params.year ?? String(now.getFullYear()), 10))

  const summary = await getMonthlyReportSummary(roles, month, year)

  const yearOpts = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  const statusGroups: Record<string, number> = {}
  for (const c of summary.contributions) {
    statusGroups[c.status] = (statusGroups[c.status] ?? 0) + 1
  }

  const collVariant = summary.collectionRate >= 80 ? 'success' : summary.collectionRate >= 50 ? 'warning' : 'danger'
  const collColor   = summary.collectionRate >= 80 ? 'text-xxm-green' : summary.collectionRate >= 50 ? 'text-amber-500' : 'text-red-500'

  const summaryCards = [
    { icon: Users,     label: 'Active Members',  value: summary.memberCount.toString(),         sub: 'enrolled',     gradient: 'from-xxm-green-50 to-white', iconBg: 'bg-xxm-green/10', iconColor: 'text-xxm-green',      border: 'border-xxm-green/15' },
    { icon: Wallet,    label: 'Total Due',        value: formatZAR(summary.totalDue),           sub: 'this month',   gradient: 'from-sky-50 to-white',       iconBg: 'bg-sky-100',      iconColor: 'text-sky-600',        border: 'border-sky-200' },
    { icon: TrendingUp, label: 'Total Collected', value: formatZAR(summary.totalPaid),          sub: 'received',     gradient: 'from-emerald-50 to-white',   iconBg: 'bg-emerald-100',  iconColor: 'text-emerald-600',    border: 'border-emerald-200' },
    { icon: BarChart3,  label: 'Collection Rate', value: `${summary.collectionRate}%`,          sub: 'of target',    gradient: summary.collectionRate >= 80 ? 'from-xxm-green-50 to-white' : 'from-amber-50 to-white', iconBg: summary.collectionRate >= 80 ? 'bg-xxm-green/10' : 'bg-amber-100', iconColor: summary.collectionRate >= 80 ? 'text-xxm-green' : 'text-amber-600', border: summary.collectionRate >= 80 ? 'border-xxm-green/15' : 'border-amber-200' },
  ]

  return (
    <div className="space-y-7">

      {/* ── Page header ──────────────────────────────────────────── */}
      <Reveal variant="up" className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">Reports</h1>
          <p className="text-sm text-xxm-gray-500 mt-1">Monthly contribution summaries and financial reporting.</p>
        </div>
        <a
          href={`/api/export?month=${month}&year=${year}`}
          download={`xkimm-xa-mali-${month}-${year}.csv`}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-canopy hover:-translate-y-0.5 transition-all duration-fast ease-smooth shadow-xxm-sm"
        >
          <Download size={14} aria-hidden />
          Export CSV
        </a>
      </Reveal>

      {/* ── Period selector ──────────────────────────────────────── */}
      <Reveal variant="up" delay={100} className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-4">
        <form method="GET" action="/reports" className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-xxm-gray-600 mr-1">Viewing period:</p>
          <div className="relative">
            <select
              name="month"
              defaultValue={month}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-xxm-gray-200 text-sm font-medium text-xxm-green-900 bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25 cursor-pointer"
            >
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xxm-gray-400 pointer-events-none" aria-hidden />
          </div>
          <div className="relative">
            <select
              name="year"
              defaultValue={year}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-xxm-gray-200 text-sm font-medium text-xxm-green-900 bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25 cursor-pointer"
            >
              {yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xxm-gray-400 pointer-events-none" aria-hidden />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-canopy transition-colors"
          >
            View
          </button>
        </form>
      </Reveal>

      {/* ── Period heading ──────────────────────────────────────── */}
      <Reveal variant="up" delay={200} className="space-y-7">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-xxm-green-900">{formatMonth(month, year)}</h2>
        <span className="text-xs text-xxm-gray-400">{summary.paidCount} of {summary.memberCount} members paid</span>
      </div>

      {/* ── Summary stat cards ───────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map(({ icon: Icon, label, value, sub, gradient, iconBg, iconColor, border }) => (
          <div
            key={label}
            className={`group bg-gradient-to-b ${gradient} rounded-2xl border ${border} shadow-xxm-sm p-5 hover:shadow-xxm hover:-translate-y-0.5 transition-all duration-fast ease-smooth`}
          >
            <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center mb-4 transition-transform duration-slow group-hover:scale-110`}>
              <Icon size={18} className={iconColor} aria-hidden />
            </div>
            <p className="stat-number text-2xl font-extrabold text-xxm-green-900 leading-none">{value}</p>
            <p className="text-xs font-semibold text-xxm-gray-700 mt-1.5">{label}</p>
            <p className="text-[11px] text-xxm-gray-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>
      </Reveal>

      {/* ── Collection progress ──────────────────────────────────── */}
      <Reveal variant="up" delay={300} className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="font-display text-base font-bold text-xxm-green-900">Collection Progress</h3>
            <p className="text-sm text-xxm-gray-500 mt-0.5">
              {formatZAR(summary.totalPaid)} of {formatZAR(summary.totalDue)} · {summary.paidCount} members paid
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className={summary.collectionRate >= 80 ? 'text-xxm-green' : 'text-xxm-gray-300'} aria-hidden />
            <span className={`stat-number text-2xl font-extrabold ${collColor}`}>
              {summary.collectionRate}%
            </span>
          </div>
        </div>
        <ProgressBar value={summary.collectionRate} max={100} variant={collVariant} animated />
        <div className="flex justify-between text-[11px] text-xxm-gray-400">
          <span>0%</span>
          <span className="font-medium text-xxm-gray-500">Target: {formatZAR(summary.totalDue)}</span>
          <span>100%</span>
        </div>
      </Reveal>

      {/* ── Status breakdown ─────────────────────────────────────── */}
      {Object.keys(statusGroups).length > 0 && (
        <Reveal variant="up" delay={300} className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-6">
          <h3 className="font-display text-base font-bold text-xxm-green-900 mb-5">Contribution Status Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {Object.entries(statusGroups).sort(([a], [b]) => a.localeCompare(b)).map(([status, count]) => {
              const styles = STATUS_STYLES[status] ?? { badge: 'bg-xxm-gray-100 text-xxm-gray-600', dot: 'bg-xxm-gray-400' }
              return (
                <div key={status} className={`flex flex-col items-center gap-1.5 p-4 rounded-2xl ${styles.badge}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${styles.dot}`} aria-hidden />
                  <p className="stat-number text-2xl font-extrabold">{count}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide">{status}</p>
                </div>
              )
            })}
          </div>
        </Reveal>
      )}

    </div>
  )
}
