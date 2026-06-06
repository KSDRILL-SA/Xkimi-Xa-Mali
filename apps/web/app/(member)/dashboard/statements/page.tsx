import type { Metadata } from 'next'
import { FileText } from 'lucide-react'
import { getSession } from '@/lib/session'
import { db } from '@/lib/db'
import { formatZAR } from '@/lib/formatters'

export const metadata: Metadata = { title: 'Statements' }

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

type ContribRow = {
  periodMonth: number
  periodYear: number
  amountDue: number | string
  amountPaid: number | string
  status: string
}

type ContribStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'WAIVED'

const STATUS_CONFIG: Record<ContribStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'xxm-status-warning' },
  PARTIAL: { label: 'Partial', className: 'xxm-status-pending' },
  PAID:    { label: 'Paid',    className: 'xxm-status-success' },
  OVERDUE: { label: 'Overdue', className: 'xxm-status-danger'  },
  WAIVED:  { label: 'Waived',  className: 'xxm-status-info'    },
}

export default async function StatementsPage() {
  const session = await getSession()
  const userId = session!.user.id

  // Get all contribution periods for this member (distinct year-month combos)
  const contributions = await db.contribution.findMany({
    where: { userId },
    orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    select: { periodMonth: true, periodYear: true, amountDue: true, amountPaid: true, status: true },
  })

  // Group by year
  const byYear = (contributions as unknown as ContribRow[]).reduce<Record<number, ContribRow[]>>((acc, c) => {
    if (!acc[c.periodYear]) acc[c.periodYear] = []
    acc[c.periodYear].push(c)
    return acc
  }, {})

  const years = Object.keys(byYear).map(Number).sort((a, b) => b - a)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-xxm-green">Statements</h1>
        <p className="text-sm text-xxm-gray-500 mt-1">Download PDF statements for any contribution period</p>
      </div>

      {contributions.length === 0 ? (
        <div className="bg-white rounded-xl border border-xxm-gray-100 p-12 text-center text-xxm-gray-400">
          <FileText size={40} className="mx-auto mb-3 text-xxm-gray-300" aria-hidden />
          <p className="font-medium">No contribution periods yet</p>
          <p className="text-sm mt-1">Statements will appear once contributions are generated for your account</p>
        </div>
      ) : (
        <div className="space-y-6">
          {years.map((year) => (
            <div key={year} className="bg-white rounded-xl border border-xxm-gray-100 overflow-hidden">
              <div className="px-4 py-3 bg-xxm-green/5 border-b border-xxm-gray-100">
                <h2 className="font-semibold text-xxm-green">{year}</h2>
              </div>
              <div className="divide-y divide-xxm-gray-50">
                {byYear[year].map((c) => {
                  const sc = STATUS_CONFIG[c.status as ContribStatus] ?? { label: c.status, className: 'xxm-status-info' }
                  const outstanding = Math.max(0, Number(c.amountDue) - Number(c.amountPaid))

                  return (
                    <div key={`${c.periodYear}-${c.periodMonth}`} className="flex items-center gap-4 px-4 py-3 hover:bg-xxm-green-50/20 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-xxm-gray-900 text-sm">
                          {MONTHS[c.periodMonth - 1]} {c.periodYear}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-xxm-gray-500 tabular-nums">Due {formatZAR(Number(c.amountDue))}</span>
                          <span className="text-xs text-xxm-gray-400">·</span>
                          <span className="text-xs text-xxm-gray-500 tabular-nums">Paid {formatZAR(Number(c.amountPaid))}</span>
                          {outstanding > 0 && (
                            <>
                              <span className="text-xs text-xxm-gray-400">·</span>
                              <span className="text-xs xxm-text-danger font-medium tabular-nums">Outstanding {formatZAR(outstanding)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className={sc.className} role="status">{sc.label}</span>
                      <a
                        href={`/api/v1/transactions/statement?month=${c.periodMonth}&year=${c.periodYear}`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-xxm-green text-white text-xs font-medium hover:bg-xxm-green/90 transition-colors"
                        target="_blank"
                        rel="noreferrer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        PDF
                      </a>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700">
        <p className="font-medium">About statements</p>
        <p className="mt-1 text-xs text-blue-600">
          Each PDF statement includes your contribution details, transactions, and a summary for that period.
          Links expire after 15 minutes — simply click again to generate a fresh download.
        </p>
      </div>
    </div>
  )
}
