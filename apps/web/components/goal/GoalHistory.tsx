import { formatZAR, formatDate } from '@/lib/formatters'
import { TrendingUp } from 'lucide-react'

export type ProgressEntry = { id: string; amount: number; recordedAt: string }

function formatRelative(isoDate: string): string {
  const date = new Date(isoDate)
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  return formatDate(date)
}

/**
 * The timeline of money recorded against a goal, newest first, with the running
 * total at each point.
 *
 * The primary fund gets a different empty state on purpose: its total is derived
 * from members' real contributions rather than hand-recorded entries, so it
 * legitimately has no timeline — "no contributions yet" would read as though no
 * money had come in at all.
 */
export function GoalHistory({ entries, isPrimary = false }: { entries: ProgressEntry[]; isPrimary?: boolean }) {
  if (entries.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm-sm p-10 text-center">
        <div className="w-11 h-11 rounded-2xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-3">
          <TrendingUp size={18} className="text-xxm-green-300" aria-hidden />
        </div>
        <p className="text-xxm-gray-400 text-sm font-medium">
          {isPrimary ? 'This fund tracks the real thing.' : 'No contributions recorded yet.'}
        </p>
        <p className="text-xxm-gray-400 text-xs mt-1">
          {isPrimary
            ? 'Its total comes straight from members’ monthly contributions rather than entries logged by hand.'
            : 'Progress will appear here as the goal grows.'}
        </p>
      </div>
    )
  }

  return (
    <div className="relative pl-5">
      {/* timeline rail */}
      <div className="absolute left-[9px] top-2 bottom-2 w-px bg-xxm-gray-100" aria-hidden />
      <div className="space-y-2.5">
        {entries.map((entry, idx) => {
          const cumulative = entries.slice(idx).reduce((s, p) => s + Number(p.amount), 0)
          return (
            <div key={entry.id} className="relative bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm px-4 py-3 flex items-center justify-between hover:shadow-xxm hover:-translate-y-0.5 transition-all duration-slow">
              <span className="absolute -left-[14px] top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-xxm-green ring-4 ring-white" aria-hidden />
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-xxm-green-50 flex items-center justify-center shrink-0">
                  <TrendingUp size={14} className="text-xxm-green" aria-hidden />
                </div>
                <div>
                  <p className="stat-number text-sm font-bold text-xxm-green-900">+{formatZAR(entry.amount)}</p>
                  <p className="text-[11px] text-xxm-gray-400">{formatRelative(entry.recordedAt)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-xxm-gray-400 uppercase tracking-wide font-semibold">Running total</p>
                <p className="stat-number text-sm font-bold text-xxm-green-700">{formatZAR(cumulative)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
