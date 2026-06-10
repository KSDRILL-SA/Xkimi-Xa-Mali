import Link from 'next/link'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { formatZAR } from '@/lib/formatters'
import { Target, ChevronRight } from 'lucide-react'
import { getGoals } from '@/services/goal.service'

export async function DashboardActiveGoals() {
  const { items: goals } = await getGoals('ACTIVE', 1, 3)

  if (goals.length === 0) return null

  return (
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
        {goals.map((g) => {
          const pct = g.progressPct
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
  )
}
