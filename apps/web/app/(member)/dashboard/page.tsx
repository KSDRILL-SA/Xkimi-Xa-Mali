import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { AnimatedStatCard } from '@/components/dashboard/AnimatedStatCard'
import { ContributionStatusBadge } from '@/components/contribution/StatusBadge'
import { formatZAR } from '@/lib/formatters'
import { TrendingUp, Calendar, CheckCircle2 } from 'lucide-react'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const session = await auth()

  const [contributions, goals] = await Promise.all([
    db.contribution.findMany({
      where: { userId: session!.user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    db.goal.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { deadline: 'asc' },
      take: 3,
    }),
  ])

  const paidCount  = contributions.filter((c) => c.status === 'PAID').length
  const totalPaid  = contributions
    .filter((c) => c.status === 'PAID')
    .reduce((sum, c) => sum + Number(c.amountPaid), 0)

  const currentYear  = new Date().getFullYear()
  const yearlyTotal  = contributions
    .filter((c) => c.periodYear === currentYear)
    .reduce((sum, c) => sum + Number(c.amountPaid), 0)

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-xxm-green-900">
          Welcome back, {session!.user.name?.split(' ')[0]}
        </h1>
        <p className="text-xxm-gray-500 text-sm mt-1">Here&apos;s your contribution overview.</p>
      </div>

      {/* Animated stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <AnimatedStatCard icon={TrendingUp} label="Total contributed"   value={totalPaid}   prefix="R " decimals={2} />
        <AnimatedStatCard icon={Calendar}   label={`${currentYear} total`} value={yearlyTotal} prefix="R " decimals={2} />
        <AnimatedStatCard icon={CheckCircle2} label="Paid contributions" value={paidCount} suffix=" paid" />
      </div>

      {/* Recent contributions */}
      <section>
        <h2 className="text-sm font-semibold text-xxm-gray-500 uppercase tracking-wide mb-3">
          Recent contributions
        </h2>
        {contributions.length === 0 ? (
          <div className="xxm-card p-8 text-center text-xxm-gray-400 text-sm">
            No contributions yet. Set up your payment mandate to get started.
          </div>
        ) : (
          <div className="xxm-card divide-y divide-xxm-gray-100">
            {contributions.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-xxm-green-900">
                    {new Date(c.dueDate).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}
                  </p>
                  <p className="text-xs text-xxm-gray-400">Due {new Date(c.dueDate).toLocaleDateString('en-ZA')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-xxm-green-900 tabular-nums">
                    {formatZAR(c.amountPaid)}
                  </span>
                  <ContributionStatusBadge status={c.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Active goals */}
      {goals.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-xxm-gray-500 uppercase tracking-wide mb-3">
            Active goals
          </h2>
          <div className="grid gap-3">
            {goals.map((g) => {
              const pct = Math.min(100, Math.round((Number(g.currentAmount) / Number(g.targetAmount)) * 100))
              return (
                <div key={g.id} className="xxm-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-xxm-green-900">{g.title}</p>
                    <span className="text-xs text-xxm-gray-400 tabular-nums">
                      {formatZAR(g.currentAmount)} / {formatZAR(g.targetAmount)}
                    </span>
                  </div>
                  <ProgressBar value={pct} size="md" variant="default" animated={pct < 100} />
                  <p className="text-xs text-xxm-gray-400">{pct}% complete · Due {new Date(g.deadline).toLocaleDateString('en-ZA')}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

