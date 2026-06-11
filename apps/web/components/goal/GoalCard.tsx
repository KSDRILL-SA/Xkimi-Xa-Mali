import Link from 'next/link'
import { formatZAR, formatDate } from '@/lib/formatters'
import { Lock, Clock, ArrowUpRight } from 'lucide-react'
import { ProgressRing } from './ProgressRing'
import { MilestoneBar } from './MilestoneBar'
import { statusTheme, typeTheme, goalIcon } from './goal-theme'

export type GoalCardData = {
  id: string
  title: string
  type: string
  status: string
  currentAmount: number
  targetAmount: number
  progressPct: number
  remaining: number
  deadline: string
  lockedAt?: string | null
}

export function GoalCard({ goal, index = 0 }: { goal: GoalCardData; index?: number }) {
  const st = statusTheme(goal.status)
  const tt = typeTheme(goal.type)
  const Icon = goalIcon(goal.status, goal.type)
  const pct = goal.progressPct
  const isOverdue = goal.status === 'ACTIVE' && new Date(goal.deadline) < new Date()
  const daysLeft = Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86_400_000)

  return (
    <Link
      href={`/dashboard/goals/${goal.id}`}
      style={{ animationDelay: `${index * 70}ms` }}
      className={`group relative block overflow-hidden rounded-3xl bg-white border border-xxm-green/8 shadow-xxm-sm p-5
        transition-all duration-slow ease-smooth hover:-translate-y-1.5 hover:shadow-xxm animate-fade-in-up ${st.glow}`}
    >
      {/* type wash — gives each goal its own identity */}
      <div className={`pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full bg-gradient-to-br ${tt.wash} blur-2xl opacity-70 transition-opacity duration-slow group-hover:opacity-100`} aria-hidden />

      <div className="relative flex items-start justify-between gap-4">
        {/* Left: identity + amounts */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${tt.wash} ring-1 ring-black/5 flex items-center justify-center shrink-0 transition-transform duration-slow ease-bounce group-hover:scale-110 group-hover:-rotate-6`}>
              <Icon size={17} className={st.label === 'Achieved' ? 'text-xxm-green' : tt.accent} aria-hidden />
            </div>
            <div className="min-w-0">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${tt.chip}`}>{tt.label}</span>
            </div>
            <span className={`ml-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 ${st.badge}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${st.dot} ${goal.status === 'ACTIVE' ? 'animate-pulse' : ''}`} aria-hidden />
              {st.label}
            </span>
          </div>

          <h3 className="mt-3 font-display text-base font-extrabold text-xxm-green-900 leading-snug truncate">{goal.title}</h3>

          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="stat-number text-2xl font-black text-xxm-green-900">{formatZAR(goal.currentAmount)}</span>
            <span className="text-[11px] text-xxm-gray-400">of {formatZAR(goal.targetAmount)}</span>
          </div>
        </div>

        {/* Right: animated ring */}
        <ProgressRing
          value={pct}
          size={92}
          strokeWidth={8}
          colorClass={st.ring}
          labelClass={pct >= 100 ? 'text-xxm-green' : 'text-xxm-green-900'}
        />
      </div>

      {/* Milestone bar */}
      <div className="relative mt-4">
        <MilestoneBar value={pct} fromClass={st.barFrom} toClass={st.barTo} />
      </div>

      {/* Footer: deadline + remaining */}
      <div className="relative mt-3 flex items-center justify-between text-[11px]">
        <span className={`inline-flex items-center gap-1 ${isOverdue ? 'text-red-500 font-bold' : 'text-xxm-gray-400'}`}>
          {goal.lockedAt && <Lock size={10} className="text-amber-500" aria-hidden />}
          <Clock size={11} aria-hidden />
          {isOverdue
            ? `Overdue by ${Math.abs(daysLeft)}d`
            : goal.status === 'ACHIEVED'
              ? `Reached · ${formatDate(goal.deadline)}`
              : daysLeft >= 0 ? `${daysLeft}d left · ${formatDate(goal.deadline)}` : formatDate(goal.deadline)}
        </span>
        {goal.status !== 'ACHIEVED' && goal.remaining > 0 ? (
          <span className="font-semibold text-xxm-gray-500">{formatZAR(goal.remaining)} to go</span>
        ) : (
          <span className="inline-flex items-center gap-0.5 font-semibold text-xxm-green opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-slow">
            View <ArrowUpRight size={12} aria-hidden />
          </span>
        )}
      </div>
    </Link>
  )
}
