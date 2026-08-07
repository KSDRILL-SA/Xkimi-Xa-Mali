import { formatZAR, formatDate } from '@xxm/utils'
import { Reveal, ProgressBar } from '@xxm/ui'
import { Clock } from 'lucide-react'
import { STATUS_CONFIG } from './goal-display'

interface Props {
  description: string | null
  status: string
  target: number
  current: number
  deadline: Date | string
  createdBy: string | null
  /**
   * Whole days until the deadline, negative once it has passed.
   *
   * Passed in rather than derived here. Reading the clock during render makes
   * the component's output depend on when it happens to run, so two renders of
   * the same goal can disagree — which React's purity rule exists to prevent.
   * "Now" is an input to the request, and belongs with the page that serves it.
   */
  daysLeft: number
}

/** The read-only summary of a goal: money raised, target, remaining and time left. */
export function GoalOverview({ description, status, target, current, deadline, createdBy, daysLeft }: Props) {
  const cfg       = STATUS_CONFIG[status] ?? STATUS_CONFIG.DRAFT!
  const pct       = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
  const remaining = Math.max(0, target - current)
  const isOverdue = status === 'ACTIVE' && daysLeft < 0

  return (
    <Reveal variant="up" delay={50} className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden">
      {description && (
        <p className="px-6 pt-6 text-sm text-xxm-gray-600 leading-relaxed">{description}</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-xxm-gray-100 m-6 rounded-2xl overflow-hidden border border-xxm-gray-100">
        <StatCell label="Raised"    value={formatZAR(current)} />
        <StatCell label="Target"    value={formatZAR(target)} />
        <StatCell label="Remaining" value={formatZAR(remaining)} />
        <StatCell
          label={isOverdue ? 'Overdue by' : 'Days left'}
          value={isOverdue ? `${Math.abs(daysLeft)}d` : daysLeft > 0 ? `${daysLeft}d` : 'Today'}
          highlight={isOverdue}
        />
      </div>

      <div className="px-6 pb-6 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="stat-number font-bold text-xxm-green-900">{pct}%</span>
          <span className="text-xxm-gray-400 text-xs">{formatZAR(current)} of {formatZAR(target)}</span>
        </div>
        <ProgressBar value={pct} max={100} size="lg" variant={cfg.bar} />
        <div className="flex items-center justify-between text-xs text-xxm-gray-400 pt-1">
          <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500 font-semibold' : ''}`}>
            <Clock size={11} aria-hidden /> {isOverdue ? 'Overdue · ' : 'Deadline · '}{formatDate(deadline)}
          </span>
          {createdBy && <span>Created by {createdBy}</span>}
        </div>
      </div>
    </Reveal>
  )
}

function StatCell({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white px-4 py-4">
      <p className="text-[10px] font-bold text-xxm-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`stat-number text-lg font-extrabold ${highlight ? 'text-red-600' : 'text-xxm-green-900'}`}>{value}</p>
    </div>
  )
}
