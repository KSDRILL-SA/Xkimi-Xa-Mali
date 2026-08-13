import type { Metadata } from 'next'
import { FileText, Download } from 'lucide-react'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { formatZAR } from '@/lib/formatters'
import { Reveal } from '@xxm/ui'
import { getStatementPeriods } from '@/services/contribution.service'
import { isFounder } from '@/services/distinction.service'
import { FounderGuideCard } from '@/components/FounderGuideCard'

export const metadata: Metadata = { title: 'Statements' }

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

type ContribRow = {
  periodMonth: number
  periodYear: number
  amountDue: number
  amountPaid: number
  status: string
}

type ContribStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'WAIVED'

const STATUS_CONFIG: Record<ContribStatus, { label: string; dot: string; badge: string }> = {
  PENDING: { label: 'Pending', dot: 'bg-amber-500',       badge: 'bg-amber-100 text-amber-700'          },
  PARTIAL: { label: 'Partial', dot: 'bg-sky-500',         badge: 'bg-sky-100 text-sky-700'               },
  PAID:    { label: 'Paid',    dot: 'bg-xxm-green',       badge: 'bg-xxm-green-100 text-xxm-green-700'   },
  OVERDUE: { label: 'Overdue', dot: 'bg-red-500',         badge: 'bg-red-100 text-red-700'               },
  WAIVED:  { label: 'Waived',  dot: 'bg-xxm-gray-400',   badge: 'bg-xxm-gray-100 text-xxm-gray-600'     },
}

/**
 * Whether a period has not started yet.
 *
 * The page lists every contribution period this member has and offered a
 * download for each. The statement API refuses a future one — "Year too far in
 * the future" — so a period dated ahead rendered a working-looking button that
 * returned a 400. Found by clicking it rather than by reading the code: the
 * page and the endpoint each behaved correctly on their own and disagreed about
 * what was downloadable.
 *
 * Admin contribution generation can create a period ahead of today, so this is
 * reachable without anything being wrong with the data.
 */
function isFuturePeriod(month: number, year: number): boolean {
  const now = new Date()
  return year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1)
}

export default async function StatementsPage() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id
  const roles  = (session.user.roles as string[] | undefined) ?? []

  // Two independent reads, so a slow one does not hold the other up.
  const [contributions, founder] = await Promise.all([
    getStatementPeriods(userId, userId, roles),
    isFounder(userId),
  ])

  const byYear = (contributions as ContribRow[]).reduce<Record<number, ContribRow[]>>((acc, c) => {
    ;(acc[c.periodYear] ??= []).push(c)
    return acc
  }, {})

  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a)

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────── */}
      <Reveal variant="up" className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-100 to-indigo-50 flex items-center justify-center shrink-0 ring-1 ring-indigo-200/60">
          <FileText size={22} className="text-indigo-600" aria-hidden />
        </div>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">Statements</h1>
          <p className="text-sm text-xxm-gray-500 mt-1">Download premium PDF statements for any contribution period</p>
        </div>
      </Reveal>

      {/* The one document that is not a statement. Shown to founders only —
          the route checks the badge again, so this is presentation, not a gate. */}
      {founder && (
        <Reveal variant="up" delay={60}>
          <FounderGuideCard />
        </Reveal>
      )}

      <Reveal variant="up" delay={100}>
      {contributions.length === 0 ? (
        <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-14 text-center">
          <div className="w-16 h-16 rounded-3xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <FileText size={26} className="text-indigo-300" aria-hidden />
          </div>
          <p className="text-xxm-green-900 font-bold">No contribution periods yet</p>
          <p className="text-xxm-gray-400 text-xs mt-1.5 max-w-xs mx-auto">
            Statements will appear once contributions are generated for your account.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {years.map((year) => (
            <div key={year} className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden">
              {/* Year header */}
              <div className="group flex items-center gap-3 px-5 py-3.5 bg-xxm-green-50/40 border-b border-xxm-gray-100">
                <div className="w-7 h-7 rounded-lg bg-xxm-green-100 flex items-center justify-center transition-transform duration-slow group-hover:scale-110">
                  <FileText size={12} className="text-xxm-green" aria-hidden />
                </div>
                <h2 className="font-bold text-xxm-green-900">{year}</h2>
                <span className="text-xs text-xxm-gray-400 ml-auto">{byYear[year]!.length} period{byYear[year]!.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Month rows */}
              <div className="divide-y divide-xxm-gray-50">
                {byYear[year]!.map((c) => {
                  const sc = STATUS_CONFIG[c.status as ContribStatus] ?? { label: c.status, dot: 'bg-xxm-gray-400', badge: 'bg-xxm-gray-100 text-xxm-gray-600' }
                  const outstanding = Math.max(0, c.amountDue - c.amountPaid)

                  return (
                    <div key={`${c.periodYear}-${c.periodMonth}`} className="flex items-center gap-4 px-5 py-4 hover:bg-xxm-green-50/20 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-xxm-green-900 text-sm">
                          {MONTHS[c.periodMonth - 1]} {c.periodYear}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[11px] text-xxm-gray-500 tabular-nums">Due {formatZAR(c.amountDue)}</span>
                          <span className="text-xxm-gray-300">·</span>
                          <span className="text-[11px] text-xxm-gray-500 tabular-nums">Paid {formatZAR(c.amountPaid)}</span>
                          {outstanding > 0 && (
                            <>
                              <span className="text-xxm-gray-300">·</span>
                              <span className="text-[11px] text-red-600 font-semibold tabular-nums">Outstanding {formatZAR(outstanding)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 ${sc.badge}`}
                        role="status"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} aria-hidden />
                        {sc.label}
                      </span>
                      {isFuturePeriod(c.periodMonth, c.periodYear) ? (
                        <span
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-xxm-gray-100 text-xxm-gray-400 text-xs font-bold shrink-0 cursor-not-allowed"
                          title="A statement can only be issued once the period has begun"
                        >
                          PDF
                        </span>
                      ) : (
                      <a
                        href={`/api/v1/transactions/statement?month=${c.periodMonth}&year=${c.periodYear}`}
                        className="group/btn inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-xxm-green text-white text-xs font-bold hover:bg-xxm-canopy hover:-translate-y-0.5 transition-all duration-fast ease-smooth shadow-xxm-sm hover:shadow-gold-sm shrink-0"
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Download PDF for ${MONTHS[c.periodMonth - 1]} ${c.periodYear}`}
                      >
                        <Download size={12} className="group-hover/btn:translate-y-0.5 transition-transform" aria-hidden />
                        PDF
                      </a>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      </Reveal>

      {/* ── Info note ──────────────────────────────── */}
      <Reveal variant="up" delay={200} className="block bg-indigo-50 border border-indigo-100 rounded-2xl p-5 space-y-1.5">
        <p className="text-sm font-bold text-indigo-700">About statements</p>
        <p className="text-xs text-indigo-600 leading-relaxed">
          Each PDF statement includes your contribution details, transactions, and a summary for that period.
          Each download is generated on request and sent straight to you — nothing is stored anywhere else, and only you can fetch your own.
        </p>
      </Reveal>
    </div>
  )
}
