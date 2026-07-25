import { formatZAR, formatDate } from '@xxm/utils'
import { Reveal } from '@xxm/ui'
import { TrendingUp } from 'lucide-react'

export interface ProgressEntry {
  id: string
  amount: unknown
  note: string | null
  recordedAt: Date
  recordedBy: { firstName: string; lastName: string } | null
}

/** Every manually recorded top-up on a goal, newest first. */
export function GoalProgressHistory({ entries }: { entries: ProgressEntry[] }) {
  return (
    <Reveal variant="up" delay={250}>
      <h2 className="text-xs font-bold text-xxm-gray-400 uppercase tracking-widest mb-3">
        Progress history ({entries.length})
      </h2>
      {entries.length === 0 ? (
        <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-10 text-center">
          <div className="w-11 h-11 rounded-2xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-3">
            <TrendingUp size={18} className="text-xxm-green-300" aria-hidden />
          </div>
          <p className="text-xxm-gray-400 text-sm font-medium">No progress recorded yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden divide-y divide-xxm-gray-50">
          {entries.map((p) => (
            <div key={p.id} className="group flex items-center justify-between px-5 py-4 hover:bg-xxm-green-50/30 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-xxm-green-50 flex items-center justify-center shrink-0 transition-transform duration-slow group-hover:scale-110">
                  <TrendingUp size={14} className="text-xxm-green" aria-hidden />
                </div>
                <div className="min-w-0">
                  <p className="stat-number text-sm font-bold text-xxm-green-900">{formatZAR(Number(p.amount))}</p>
                  <p className="text-[11px] text-xxm-gray-400 truncate">
                    {formatDate(p.recordedAt)}
                    {p.recordedBy && ` · ${p.recordedBy.firstName} ${p.recordedBy.lastName}`}
                    {p.note && ` · ${p.note}`}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Reveal>
  )
}
