import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
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

  const totalPaid = contributions
    .filter((c) => c.status === 'PAID')
    .reduce((sum, c) => sum + Number(c.amountPaid), 0)

  const currentYear = new Date().getFullYear()
  const yearlyTotal = contributions
    .filter((c) => c.periodYear === currentYear)
    .reduce((sum, c) => sum + Number(c.amountPaid), 0)

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-xxm-green-900">
          Welcome back, {session!.user.name?.split(' ')[0]}
        </h1>
        <p className="text-gray-500 text-sm mt-1">Here&apos;s your contribution overview.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard icon={TrendingUp} label="Total contributed" value={formatZAR(totalPaid)} />
        <StatCard icon={Calendar}   label={`${currentYear} total`} value={formatZAR(yearlyTotal)} />
        <StatCard
          icon={CheckCircle2}
          label="Contributions"
          value={`${contributions.filter((c) => c.status === 'PAID').length} paid`}
        />
      </div>

      {/* Recent contributions */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Recent contributions
        </h2>
        {contributions.length === 0 ? (
          <div className="xxm-card p-8 text-center text-gray-400 text-sm">
            No contributions yet. Set up your payment mandate to get started.
          </div>
        ) : (
          <div className="xxm-card divide-y divide-gray-100">
            {contributions.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-xxm-green-900">
                    {new Date(c.dueDate).toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}
                  </p>
                  <p className="text-xs text-gray-400">Due {new Date(c.dueDate).toLocaleDateString('en-ZA')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="amount text-sm font-semibold text-xxm-green-900">
                    {formatZAR(c.amountPaid)}
                  </span>
                  <StatusBadge status={c.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Active goals */}
      {goals.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Active goals
          </h2>
          <div className="grid gap-3">
            {goals.map((g) => {
              const pct = Math.min(100, Math.round((Number(g.currentAmount) / Number(g.targetAmount)) * 100))
              return (
                <div key={g.id} className="xxm-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-xxm-green-900">{g.title}</p>
                    <span className="text-xs text-gray-400">
                      {formatZAR(g.currentAmount)} / {formatZAR(g.targetAmount)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-xxm-green-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-xxm-green transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400">{pct}% complete · Due {new Date(g.deadline).toLocaleDateString('en-ZA')}</p>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

import type { LucideIcon } from 'lucide-react'

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="xxm-card p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-xxm-champagne-200 flex items-center justify-center shrink-0">
        <Icon size={18} className="text-xxm-green" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide truncate">{label}</p>
        <p className="text-xl font-bold text-xxm-green-900 mt-0.5 amount">{value}</p>
      </div>
    </div>
  )
}

const STATUS_STYLES: Record<string, string> = {
  PAID:    'bg-green-100 text-green-700',
  PENDING: 'bg-amber-100 text-amber-700',
  PARTIAL: 'bg-blue-100 text-blue-700',
  OVERDUE: 'bg-red-100 text-red-700',
  WAIVED:  'bg-gray-100 text-gray-500',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`status-pill ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  )
}
