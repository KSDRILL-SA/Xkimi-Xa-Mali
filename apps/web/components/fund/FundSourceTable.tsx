import { formatZAR } from '@/lib/formatters'
import { Wallet, Target, Equal } from 'lucide-react'

type Source = { credited: number; debited: number; net: number }

/**
 * The fund as an accounting statement: what came in, what was reversed, what
 * remains — for each source and for the whole.
 *
 * ── Why reversals get their own column ─────────────────────────────────────
 *
 * A member watching a total move without explanation stops believing the
 * total. The pool ledger is append-only: a reversal is a DEBIT posted beside
 * the original CREDIT, never a deletion, so both halves genuinely exist and
 * can be shown. Presenting only the net figure would hide the one event most
 * likely to make somebody ask a question.
 *
 * ── Two renderings of one table ────────────────────────────────────────────
 *
 * A four-column financial table cannot be read at 360px; shrinking the type
 * until it fits produces something nobody checks their money against. So the
 * `<table>` is for `sm:` and up, and below that the same rows render as
 * stacked blocks with the figures labelled individually.
 *
 * Both are generated from the same array, so they cannot disagree.
 */
export function FundSourceTable({
  monthly,
  goals,
  balance,
}: {
  monthly: Source
  goals: Source
  balance: number
}) {
  const rows = [
    {
      key: 'monthly',
      icon: Wallet,
      label: 'Monthly contributions',
      hint: 'Your regular monthly amount',
      source: monthly,
      tint: 'text-xxm-gold-dark',
      dot: 'bg-xxm-gold',
    },
    {
      key: 'goals',
      icon: Target,
      label: 'Toward goals',
      hint: 'Money directed at a named goal',
      source: goals,
      tint: 'text-emerald-600',
      dot: 'bg-emerald-500',
    },
  ]

  const credited = rows.reduce((sum, r) => sum + r.source.credited, 0)
  const debited = rows.reduce((sum, r) => sum + r.source.debited, 0)

  return (
    <div className="overflow-hidden rounded-2xl border border-xxm-green/12 bg-white shadow-xxm-sm sm:shadow-xxm">
      {/* ── Table, sm and up ─────────────────────────────────────────────── */}
      {/* `overflow-x-auto` so a long goal name scrolls the table rather than
          the page. The page body must never scroll sideways. */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <caption className="sr-only">
            Fund movement by source: received, reversed and remaining
          </caption>
          <thead>
            <tr className="border-b border-xxm-gray-100 bg-gradient-to-r from-xxm-green-50 to-white">
              <th
                scope="col"
                className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-xxm-gray-500"
              >
                Source
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-xxm-gray-500"
              >
                Received
              </th>
              <th
                scope="col"
                className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-xxm-gray-500"
              >
                Reversed
              </th>
              <th
                scope="col"
                className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-xxm-gray-500"
              >
                In the fund
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-xxm-gray-100">
            {rows.map((row) => (
              <tr key={row.key} className="transition-colors hover:bg-xxm-green-50/40">
                <th scope="row" className="px-5 py-3.5 text-left font-normal">
                  <span className="flex items-center gap-2.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${row.dot}`} aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate font-bold text-xxm-green-900">
                        {row.label}
                      </span>
                      <span className="block text-[11px] text-xxm-gray-400">{row.hint}</span>
                    </span>
                  </span>
                </th>
                <td className="stat-number px-4 py-3.5 text-right font-semibold text-xxm-gray-700">
                  {formatZAR(row.source.credited)}
                </td>
                <td
                  className={`stat-number px-4 py-3.5 text-right font-semibold ${
                    row.source.debited > 0 ? 'text-red-600' : 'text-xxm-gray-300'
                  }`}
                >
                  {row.source.debited > 0 ? `−${formatZAR(row.source.debited)}` : '—'}
                </td>
                <td className="stat-number px-5 py-3.5 text-right font-extrabold text-xxm-green-900">
                  {formatZAR(row.source.net)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-xxm-green/15 bg-xxm-green-50/60">
              <th scope="row" className="px-5 py-4 text-left">
                <span className="flex items-center gap-2.5">
                  <Equal size={13} className="shrink-0 text-xxm-green" aria-hidden />
                  <span className="text-[11px] font-bold uppercase tracking-widest text-xxm-green-800">
                    Total fund
                  </span>
                </span>
              </th>
              <td className="stat-number px-4 py-4 text-right font-bold text-xxm-gray-700">
                {formatZAR(credited)}
              </td>
              <td
                className={`stat-number px-4 py-4 text-right font-bold ${
                  debited > 0 ? 'text-red-600' : 'text-xxm-gray-300'
                }`}
              >
                {debited > 0 ? `−${formatZAR(debited)}` : '—'}
              </td>
              <td className="stat-number px-5 py-4 text-right font-display text-lg font-black text-xxm-green-900">
                {formatZAR(balance)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* ── Stacked, below sm ────────────────────────────────────────────── */}
      <div className="divide-y divide-xxm-gray-100 sm:hidden">
        {rows.map((row) => (
          <div key={row.key} className="px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${row.dot}`} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-xxm-green-900">
                {row.label}
              </span>
              <span className="stat-number shrink-0 text-sm font-extrabold text-xxm-green-900">
                {formatZAR(row.source.net)}
              </span>
            </div>
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-[1.125rem] text-[11px]">
              <div className="flex gap-1">
                <dt className="text-xxm-gray-400">Received</dt>
                <dd className="stat-number font-semibold text-xxm-gray-600">
                  {formatZAR(row.source.credited)}
                </dd>
              </div>
              {row.source.debited > 0 && (
                <div className="flex gap-1">
                  <dt className="text-xxm-gray-400">Reversed</dt>
                  <dd className="stat-number font-semibold text-red-600">
                    −{formatZAR(row.source.debited)}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        ))}
        <div className="flex items-center justify-between gap-3 bg-xxm-green-50/60 px-4 py-3.5">
          <span className="text-[11px] font-bold uppercase tracking-widest text-xxm-green-800">
            Total fund
          </span>
          <span className="stat-number font-display text-base font-black text-xxm-green-900">
            {formatZAR(balance)}
          </span>
        </div>
      </div>
    </div>
  )
}
