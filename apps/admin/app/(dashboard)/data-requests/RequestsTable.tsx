'use client'

import { useEffect, useState } from 'react'
import { ShieldQuestion, Clock, AlertTriangle, Check, X, Play } from 'lucide-react'

export type DsrRow = {
  id: string
  requester: string
  email: string
  kind: string
  detail: string
  status: string
  statusClass: string
  receivedAt: string
  dueAt: string
  /** The deadline itself; how long is left is worked out on the client. */
  dueAtIso: string
  open: boolean
  handledBy: string | null
  outcome: string | null
  /**
   * Set only for an open DELETION request that is linked to a known member.
   * Without a member there is nothing to inventory, and on a closed request
   * there is nothing left to decide.
   */
  erasureHref: string | null
}

type DsrAction = (formData: FormData) => Promise<void>

const GRID = 'grid grid-cols-[1.6fr_1fr_1.1fr_150px_220px] gap-3'

/**
 * The thirty-day clock, shown rather than calculable.
 *
 * The whole reason this log exists is that POPIA gives the Foundation thirty
 * days to answer and nothing was counting them. A table that showed only a
 * received date would leave the arithmetic to whoever happened to look, which is
 * the same failure in a nicer font.
 *
 * Counted after mount rather than during render, for two reasons that happen to
 * agree: reading the clock during render is impure and React says so, and a
 * number computed on the server would be wrong for anyone reading a cached page
 * or one left open overnight — which, for a countdown, is the whole value.
 */
function Countdown({ dueAtIso, open }: { dueAtIso: string; open: boolean }) {
  const [daysLeft, setDaysLeft] = useState<number | null>(null)

  useEffect(() => {
    // Floor, so "0d left" means today is the last day rather than yesterday was.
    const tick = () =>
      setDaysLeft(Math.floor((new Date(dueAtIso).getTime() - Date.now()) / 86_400_000))
    tick()
    // Re-checked hourly so a page left open does not keep yesterday's answer.
    const id = setInterval(tick, 3_600_000)
    return () => clearInterval(id)
  }, [dueAtIso])

  if (!open) return <span className="text-xs text-xxm-gray-400">Closed</span>
  if (daysLeft === null) return <span className="text-xs text-xxm-gray-300">&nbsp;</span>

  if (daysLeft < 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700">
        <AlertTriangle size={13} aria-hidden />
        {Math.abs(daysLeft)}d overdue
      </span>
    )
  }

  // Seven days is where a request stops being something to get to and starts
  // being something to do.
  const urgent = daysLeft <= 7
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-semibold ${
        urgent ? 'text-amber-700' : 'text-xxm-gray-500'
      }`}
    >
      <Clock size={13} aria-hidden />
      {daysLeft}d left
    </span>
  )
}

export function RequestsTable({
  rows,
  filtered = false,
  startAction,
  closeAction,
}: {
  rows: DsrRow[]
  /** Whether a filter is narrowing the list, so "nothing here" can say which it means. */
  filtered?: boolean
  startAction: DsrAction
  closeAction: DsrAction
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-4">
          <ShieldQuestion size={24} className="text-xxm-green-300" aria-hidden />
        </div>
        {/* An empty table under a filter means "none match", not "none exist",
            and the two need different words. Combining a status with "overdue
            only" can legitimately match nothing — a completed request is not
            also awaiting an answer — and reading "No requests logged" there
            would suggest the log had emptied itself. */}
        <p className="text-xxm-gray-600 font-medium">
          {filtered ? 'No requests match this filter' : 'No requests logged'}
        </p>
        <p className="text-xxm-gray-400 text-sm mt-1">
          {filtered
            ? 'Clear the filter to see every request.'
            : 'Log one when a member asks to see, correct, or delete their information.'}
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden">
      <div
        className={`${GRID} px-5 py-3 bg-xxm-green-50/60 border-b border-xxm-green/8 text-[11px] font-bold text-xxm-gray-500 uppercase tracking-wider`}
      >
        <span>Requester</span>
        <span>Request</span>
        <span>Received / due</span>
        <span>Time</span>
        <span>Action</span>
      </div>

      <div className="divide-y divide-xxm-gray-100">
        {rows.map((r) => (
          <div key={r.id} className={`${GRID} px-5 py-4 items-start hover:bg-xxm-gray-50/50 transition-colors`}>
            <div className="min-w-0">
              <p className="font-semibold text-sm text-xxm-green-900 truncate">{r.requester}</p>
              <p className="text-xs text-xxm-gray-400 truncate">{r.email}</p>
              {r.handledBy && (
                <p className="text-[11px] text-xxm-gray-400 mt-1">Handled by {r.handledBy}</p>
              )}
            </div>

            <div className="min-w-0">
              <span className={`inline-block ${r.statusClass} mb-1`}>{r.status}</span>
              <p className="text-xs font-medium text-xxm-gray-600">{r.kind}</p>
              <p className="text-[11px] text-xxm-gray-400 line-clamp-2 mt-0.5">{r.detail}</p>
              {r.outcome && (
                <p className="text-[11px] text-xxm-gray-500 mt-1 italic line-clamp-2">{r.outcome}</p>
              )}
            </div>

            <div className="text-xs text-xxm-gray-500">
              <p>{r.receivedAt}</p>
              <p className="text-xxm-gray-400">due {r.dueAt}</p>
            </div>

            <div className="pt-0.5">
              <Countdown dueAtIso={r.dueAtIso} open={r.open} />
            </div>

            <div className="space-y-2">
              {r.erasureHref && (
                // Before answering a deletion request, see what is actually
                // held. Almost none of it is lawfully erasable, and the reasons
                // are what the requester is owed.
                <a
                  href={r.erasureHref}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-xxm-gold/40 text-xxm-gold-dark text-xs font-semibold hover:bg-xxm-gold/5 transition-colors"
                >
                  <ShieldQuestion size={12} aria-hidden />
                  What we hold
                </a>
              )}

              {r.status === 'Received' && (
                <form action={startAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button
                    type="submit"
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-xxm-green text-white text-xs font-semibold hover:bg-xxm-canopy transition-colors"
                  >
                    <Play size={12} aria-hidden />
                    Start
                  </button>
                </form>
              )}

              {r.open && (
                <form action={closeAction} className="space-y-1.5">
                  <input type="hidden" name="id" value={r.id} />
                  <textarea
                    name="outcome"
                    required
                    rows={2}
                    placeholder="What was provided, or why refused"
                    className="w-full rounded-lg border border-xxm-gray-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="submit"
                      name="status"
                      value="COMPLETED"
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
                    >
                      <Check size={12} aria-hidden />
                      Answered
                    </button>
                    <button
                      type="submit"
                      name="status"
                      value="REFUSED"
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-50 transition-colors"
                    >
                      <X size={12} aria-hidden />
                      Refused
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
