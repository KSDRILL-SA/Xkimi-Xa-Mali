import type { Metadata } from 'next'
import Link from 'next/link'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { getMemberSummary } from '@/services/member.service'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { AnimatedStatCard } from '@/components/dashboard/AnimatedStatCard'
import { ContributionStatusBadge } from '@/components/contribution/StatusBadge'
import { formatZAR } from '@/lib/formatters'
import {
  TrendingUp, Calendar, CheckCircle2,
  Wallet, Target, ArrowRight, Sparkles,
  ChevronRight,
} from 'lucide-react'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const session = await getSession()
  const userId  = session!.user.id
  const roles   = session!.user.roles ?? []

  const currentYear = new Date().getFullYear()

  type RecentContrib = Awaited<ReturnType<typeof db.contribution.findMany>>[number]
  type ActiveGoal    = Awaited<ReturnType<typeof db.goal.findMany>>[number]

  const [summary, recentContributions, goals] = await Promise.all([
    getMemberSummary(userId, userId, roles),
    db.contribution.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    db.goal.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { deadline: 'asc' },
      take: 3,
    }),
  ])

  const firstName = session!.user.name?.split(' ')[0] ?? 'Member'
  const hasOpenContrib = recentContributions.some((c: RecentContrib) =>
    ['PENDING', 'PARTIAL', 'OVERDUE'].includes(c.status),
  )

  return (
    <div className="space-y-7">

      {/* ── Hero greeting ───────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-xxm-green via-xxm-canopy to-xxm-green-900 rounded-2xl p-6 md:p-8 text-white shadow-xxm-lg">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-xxm-gold" aria-hidden />
            <p className="text-xxm-gold text-xs font-bold tracking-widest uppercase">Member Dashboard</p>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
            Welcome back, {firstName}
          </h1>
          <p className="text-green-200/80 mt-2 text-sm max-w-md leading-relaxed">
            Your financial journey with Xkimm Xa Mali.{' '}
            {hasOpenContrib ? (
              <span className="text-white font-semibold">You have open contributions this month.</span>
            ) : (
              <span className="text-xxm-gold font-semibold">All contributions up to date!</span>
            )}
          </p>
          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <Link
              href="/dashboard/contributions"
              className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors border border-white/10"
            >
              <Wallet size={14} aria-hidden /> View Contributions
            </Link>
            {hasOpenContrib && (
              <Link
                href="/dashboard/contribute"
                className="inline-flex items-center gap-2 bg-xxm-gold hover:bg-xxm-gold-light text-xxm-green-900 text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow-gold-sm"
              >
                Make Payment
              </Link>
            )}
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/4 pointer-events-none" aria-hidden />
        <div className="absolute bottom-0 right-1/4 w-36 h-36 bg-xxm-gold/10 rounded-full translate-y-1/2 pointer-events-none" aria-hidden />
      </div>

      {/* ── Animated stat cards ─────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <AnimatedStatCard icon={TrendingUp}   label="Total contributed"      value={summary.totalContributed}  prefix="R " decimals={2}
          gradient="from-xxm-green-50 to-white" iconBg="bg-xxm-green/10" iconColor="text-xxm-green" border="border-xxm-green/15" />
        <AnimatedStatCard icon={Calendar}     label={`${currentYear} total`} value={summary.yearlyContributed} prefix="R " decimals={2}
          gradient="from-amber-50 to-white" iconBg="bg-xxm-gold/15" iconColor="text-xxm-gold-dark" border="border-xxm-gold/20" />
        <AnimatedStatCard icon={CheckCircle2} label="Paid contributions"     value={summary.paidCount}         suffix=" paid"
          gradient="from-emerald-50 to-white" iconBg="bg-emerald-100" iconColor="text-emerald-600" border="border-emerald-200" />
      </div>

      {/* ── Recent contributions ─────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-bold text-xxm-gray-400 uppercase tracking-widest">Recent Contributions</h2>
          <Link
            href="/dashboard/contributions"
            className="inline-flex items-center gap-1 text-xs font-semibold text-xxm-green hover:text-xxm-canopy transition-colors"
          >
            View all <ChevronRight size={13} aria-hidden />
          </Link>
        </div>

        {recentContributions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-3">
              <Wallet size={20} className="text-xxm-green-300" aria-hidden />
            </div>
            <p className="text-xxm-gray-500 text-sm font-medium">No contributions yet</p>
            <p className="text-xxm-gray-400 text-xs mt-1">Set up your payment mandate to get started.</p>
            <Link
              href="/dashboard/mandates"
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-xxm-green text-white text-xs font-semibold hover:bg-xxm-canopy transition-colors"
            >
              Set up mandate <ArrowRight size={12} aria-hidden />
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm overflow-hidden">
            {recentContributions.map((c: RecentContrib, i: number) => (
              <div
                key={c.id}
                className={`flex items-center justify-between px-5 py-4 hover:bg-xxm-green-50/40 transition-colors ${
                  i < recentContributions.length - 1 ? 'border-b border-xxm-gray-50' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-xxm-green-50 flex items-center justify-center shrink-0">
                    <Wallet size={15} className="text-xxm-green" aria-hidden />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-xxm-green-900">
                      {new Date(c.dueDate).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}
                    </p>
                    <p className="text-[11px] text-xxm-gray-400">
                      Due {new Date(c.dueDate).toLocaleDateString('en-ZA')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-xxm-green-900 tabular-nums">
                    {formatZAR(c.amountPaid)}
                  </span>
                  <ContributionStatusBadge status={c.status} />
                </div>
              </div>
            ))}
            <div className="px-5 py-3 bg-xxm-gray-50 border-t border-xxm-gray-100">
              <Link
                href="/dashboard/contributions"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-xxm-green hover:text-xxm-canopy transition-colors"
              >
                View full history <ArrowRight size={12} aria-hidden />
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* ── Active goals ─────────────────────────────────────── */}
      {goals.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold text-xxm-gray-400 uppercase tracking-widest">Active Goals</h2>
            <Link
              href="/dashboard/goals"
              className="inline-flex items-center gap-1 text-xs font-semibold text-xxm-green hover:text-xxm-canopy transition-colors"
            >
              View all <ChevronRight size={13} aria-hidden />
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {goals.map((g: ActiveGoal) => {
              const pct = Math.min(100, Math.round((Number(g.currentAmount) / Number(g.targetAmount)) * 100))
              return (
                <Link
                  key={g.id}
                  href={`/dashboard/goals/${g.id}`}
                  className="group bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-5 space-y-3 hover:shadow-xxm hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="w-9 h-9 rounded-xl bg-xxm-gold/10 flex items-center justify-center shrink-0">
                      <Target size={15} className="text-xxm-gold-dark" aria-hidden />
                    </div>
                    <span className={`text-xs font-bold tabular-nums ${pct >= 100 ? 'text-xxm-green' : 'text-xxm-gold-dark'}`}>
                      {pct}%
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-xxm-green-900 leading-snug">{g.title}</p>
                    <p className="text-[11px] text-xxm-gray-400 mt-0.5 tabular-nums">
                      {formatZAR(g.currentAmount)} of {formatZAR(g.targetAmount)}
                    </p>
                  </div>
                  <ProgressBar value={pct} size="sm" variant="gold" animated={pct < 100} />
                  <p className="text-[11px] text-xxm-gray-400">
                    Due {new Date(g.deadline).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </Link>
              )
            })}
          </div>
        </section>
      )}

    </div>
  )
}
