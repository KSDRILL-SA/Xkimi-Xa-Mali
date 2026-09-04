import Link from 'next/link'
import type { Route } from 'next'
import { formatZAR } from '@/lib/formatters'
import { Star, ChevronRight } from 'lucide-react'

type GoalRow = {
  id: string
  title: string
  raised: number
  target: number
  status: string
  isPrimary: boolean
}

const STATUS_STYLE: Record<string, { label: string; badge: string; bar: string }> = {
  ACTIVE: { label: 'Active', badge: 'bg-xxm-green-100 text-xxm-green-700', bar: 'bg-xxm-green' },
  ACHIEVED: { label: 'Achieved', badge: 'bg-xxm-gold/20 text-xxm-gold-deep', bar: 'bg-xxm-gold' },
  FAILED: {
    label: 'Missed deadline',
    badge: 'bg-xxm-gray-100 text-xxm-gray-600',
    bar: 'bg-xxm-gray-300',
  },
}

function style(status: string) {
  return STATUS_STYLE[status] ?? STATUS_STYLE.ACTIVE!
}

function pctOf(raised: number, target: number) {
  return target > 0 ? Math.min(100, Math.round((raised / target) * 100)) : 0
}

/**
 * Where the goal money sits, goal by goal — as a table on `sm:` and up, and as
 * stacked rows below it.
 *
 * ── Why a real table ───────────────────────────────────────────────────────
 *
 * Raised, target, progress and status are four values compared *across* rows:
 * a member wants to see which goal is furthest along, not read four goals in
 * sequence. That is what columns are for, and aligning the money on
 * `tabular-nums` is what makes the comparison possible at a glance.
 *
 * Below `sm:` there is no honest way to show four columns, so the same data
 * renders as blocks with the figures labelled. Both come from one array.
 *
 * ── Failed goals are listed ────────────────────────────────────────────────
 *
 * A goal that missed its deadline still holds every rand raised into it.
 * Listing only the goals that are going well would hide money the member has
 * actually given.
 *
 * ── Why there is no total row ──────────────────────────────────────────────
 *
 * These figures are `Goal.currentAmount`, and that is **not** the same measure
 * as the fund split above them. `syncPrimaryGoalProgress` sets the primary
 * fund's amount to every monthly contribution inside the fund's window *plus*
 * any directed payments — so the primary fund's number already contains the
 * money counted under "Monthly contributions". `syncAdditionalGoalProgress`
 * adds admin-recorded `GoalProgress`, which is never posted to the pool ledger
 * at all.
 *
 * Summing this column would therefore produce a figure larger than the fund
 * itself, presented as if it were part of it. The rows are true individually
 * and are shown that way; the arithmetic that does add up lives in
 * `FundSourceTable`, which reads the ledger alone.
 */
export function GoalBreakdown({ goals }: { goals: GoalRow[] }) {
  if (goals.length === 0) {
    return (
      <div className="rounded-2xl border border-xxm-green/12 bg-white p-8 text-center shadow-xxm-sm">
        <p className="font-bold text-xxm-green-900">No goals yet</p>
        <p className="mx-auto mt-1.5 max-w-xs text-xs text-xxm-gray-400">
          Once leadership activates a goal, what it has raised appears here.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-xxm-green/12 bg-white shadow-xxm-sm sm:shadow-xxm">
      {/* ── Table, sm and up ─────────────────────────────────────────────── */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[38rem] border-collapse text-sm">
          <caption className="sr-only">Money raised per goal, against each goal&apos;s target</caption>
          <thead>
            <tr className="border-b border-xxm-gray-100 bg-gradient-to-r from-xxm-green-50 to-white">
              <th
                scope="col"
                className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-xxm-gray-500"
              >
                Goal
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-xxm-gray-500"
              >
                Status
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-xxm-gray-500"
              >
                Raised
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-xxm-gray-500"
              >
                Target
              </th>
              <th
                scope="col"
                className="w-40 px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-xxm-gray-500"
              >
                Progress
              </th>
              <th scope="col" className="w-10 px-2 py-3">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-xxm-gray-100">
            {goals.map((goal) => {
              const s = style(goal.status)
              const pct = pctOf(goal.raised, goal.target)
              return (
                <tr key={goal.id} className="group transition-colors hover:bg-xxm-green-50/40">
                  <th scope="row" className="px-5 py-3.5 text-left font-normal">
                    <Link
                      href={`/dashboard/goals/${goal.id}` as Route}
                      className="flex items-center gap-1.5 outline-none focus-visible:underline"
                    >
                      {goal.isPrimary && (
                        <Star size={12} className="shrink-0 text-xxm-gold" aria-hidden />
                      )}
                      <span className="truncate font-bold text-xxm-green-900">{goal.title}</span>
                    </Link>
                    {goal.isPrimary && (
                      <span className="mt-0.5 block text-[11px] text-xxm-gray-400">
                        Fed by every monthly contribution
                      </span>
                    )}
                  </th>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.badge}`}
                    >
                      {s.label}
                    </span>
                  </td>
                  <td className="stat-number px-4 py-3.5 text-right font-extrabold text-xxm-green-900">
                    {formatZAR(goal.raised)}
                  </td>
                  <td className="stat-number px-4 py-3.5 text-right font-semibold text-xxm-gray-500">
                    {formatZAR(goal.target)}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-xxm-gray-100">
                        <span
                          className={`block h-full rounded-full transition-[width] duration-500 ${s.bar}`}
                          style={{ width: `${pct}%` }}
                          role="progressbar"
                          aria-valuenow={pct}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${goal.title} progress`}
                        />
                      </span>
                      <span className="stat-number w-9 shrink-0 text-right text-[11px] font-bold text-xxm-gray-500">
                        {pct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-3.5 text-right">
                    <ChevronRight
                      size={15}
                      className="inline text-xxm-gray-300 sm:transition-transform sm:group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Stacked, below sm ────────────────────────────────────────────── */}
      <div className="divide-y divide-xxm-gray-100 sm:hidden">
        {goals.map((goal) => {
          const s = style(goal.status)
          const pct = pctOf(goal.raised, goal.target)
          return (
            <Link
              key={goal.id}
              href={`/dashboard/goals/${goal.id}` as Route}
              className="block px-4 py-3.5 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {goal.isPrimary && (
                      <Star size={12} className="shrink-0 text-xxm-gold" aria-hidden />
                    )}
                    <span className="truncate text-sm font-bold text-xxm-green-900">
                      {goal.title}
                    </span>
                  </div>
                  {goal.isPrimary && (
                    <span className="mt-0.5 block text-[11px] text-xxm-gray-400">
                      Fed by every monthly contribution
                    </span>
                  )}
                  <span
                    className={`mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.badge}`}
                  >
                    {s.label}
                  </span>
                </div>
                <div className="shrink-0 text-right">
                  <p className="stat-number text-sm font-extrabold text-xxm-green-900">
                    {formatZAR(goal.raised)}
                  </p>
                  <p className="stat-number text-[11px] text-xxm-gray-400">
                    of {formatZAR(goal.target)}
                  </p>
                </div>
              </div>

              <div className="mt-2.5 flex items-center gap-2.5">
                <span className="block h-1 flex-1 overflow-hidden rounded-full bg-xxm-gray-100">
                  <span
                    className={`block h-full rounded-full transition-[width] duration-500 ${s.bar}`}
                    style={{ width: `${pct}%` }}
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${goal.title} progress`}
                  />
                </span>
                <span className="stat-number shrink-0 text-[11px] font-bold text-xxm-gray-500">
                  {pct}%
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
