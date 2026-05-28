import type { Metadata } from 'next'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatZAR, formatDate } from '@/lib/formatters'

export const metadata: Metadata = { title: 'Transactions' }

const PAGE_SIZE = 25

type TxStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'REVERSED'
type TxType   = 'DEBIT_ORDER' | 'MANUAL' | 'REVERSAL'

type TxRow = {
  id: string
  amount: number | string
  type: string
  status: string
  gatewayRef: string | null
  idempotencyKey: string
  processedAt: Date | null
  createdAt: Date
  contribution: { periodMonth: number; periodYear: number }
}

const STATUS_CONFIG: Record<TxStatus, { label: string; className: string }> = {
  PENDING:    { label: 'Pending',    className: 'bg-yellow-100 text-yellow-700' },
  PROCESSING: { label: 'Processing', className: 'bg-blue-100 text-blue-700' },
  SUCCESS:    { label: 'Success',    className: 'bg-green-100 text-green-700' },
  FAILED:     { label: 'Failed',     className: 'bg-red-100 text-red-700' },
  REVERSED:   { label: 'Reversed',   className: 'bg-gray-100 text-gray-600' },
}

const TYPE_LABELS: Record<TxType, string> = {
  DEBIT_ORDER: 'Debit Order',
  MANUAL:      'Manual',
  REVERSAL:    'Reversal',
}

const MONTHS = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec',
]

function periodLabel(month: number, year: number) {
  return `${MONTHS[month - 1]} ${year}`
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; from?: string; to?: string; page?: string }>
}) {
  const session = await auth()
  const userId = session!.user.id
  const params = await searchParams

  const page = Math.max(1, Number(params.page ?? '1'))
  const skip = (page - 1) * PAGE_SIZE

  const validStatuses: TxStatus[] = ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REVERSED']
  const validTypes: TxType[]       = ['DEBIT_ORDER', 'MANUAL', 'REVERSAL']

  const statusFilter = params.status && validStatuses.includes(params.status as TxStatus)
    ? (params.status as TxStatus) : undefined
  const typeFilter = params.type && validTypes.includes(params.type as TxType)
    ? (params.type as TxType) : undefined

  const where = {
    contribution: { userId },
    ...(statusFilter && { status: statusFilter }),
    ...(typeFilter   && { type:   typeFilter }),
    ...((params.from || params.to)
      ? {
          createdAt: {
            ...(params.from && { gte: new Date(params.from) }),
            ...(params.to   && { lte: new Date(`${params.to}T23:59:59.999Z`) }),
          },
        }
      : {}),
  }

  const [txs, total] = await Promise.all([
    db.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: PAGE_SIZE,
      include: { contribution: { select: { periodMonth: true, periodYear: true } } },
    }),
    db.transaction.count({ where }),
  ])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { status: statusFilter, type: typeFilter, from: params.from, to: params.to, page: String(page), ...overrides }
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v) })
    return `/dashboard/transactions?${p.toString()}`
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-xxm-green">Transactions</h1>
        <p className="text-sm text-gray-500 mt-1">Full payment history for your account</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider self-center mr-1">Status</span>
          <Link
            href={buildUrl({ status: undefined, page: '1' })}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${!statusFilter ? 'bg-xxm-green text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            All
          </Link>
          {validStatuses.map((s) => (
            <Link
              key={s}
              href={buildUrl({ status: s, page: '1' })}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${statusFilter === s ? 'bg-xxm-green text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {STATUS_CONFIG[s].label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider self-center mr-1">Type</span>
          <Link
            href={buildUrl({ type: undefined, page: '1' })}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${!typeFilter ? 'bg-xxm-green text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            All
          </Link>
          {validTypes.map((t) => (
            <Link
              key={t}
              href={buildUrl({ type: t, page: '1' })}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${typeFilter === t ? 'bg-xxm-green text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {TYPE_LABELS[t]}
            </Link>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {txs.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p className="text-4xl mb-3">💳</p>
            <p className="font-medium">No transactions found</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-xxm-green text-white text-xs uppercase tracking-wider">
                    <th className="px-4 py-3 text-left font-semibold">Period</th>
                    <th className="px-4 py-3 text-left font-semibold">Type</th>
                    <th className="px-4 py-3 text-right font-semibold">Amount</th>
                    <th className="px-4 py-3 text-center font-semibold">Status</th>
                    <th className="px-4 py-3 text-left font-semibold hidden md:table-cell">Reference</th>
                    <th className="px-4 py-3 text-right font-semibold hidden lg:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(txs as TxRow[]).map((tx, i) => {
                    const sc = STATUS_CONFIG[tx.status as TxStatus] ?? { label: tx.status, className: 'bg-gray-100 text-gray-600' }
                    return (
                      <tr key={tx.id} className={`border-b border-gray-50 ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                        <td className="px-4 py-3 font-medium text-xxm-green">
                          {periodLabel(tx.contribution.periodMonth, tx.contribution.periodYear)}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {TYPE_LABELS[tx.type as TxType] ?? tx.type}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {formatZAR(Number(tx.amount))}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${sc.className}`}>
                            {sc.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell font-mono">
                          {tx.gatewayRef ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400 text-xs hidden lg:table-cell">
                          {formatDate(tx.createdAt)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Showing {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} of {total}
                </p>
                <div className="flex gap-2">
                  {page > 1 && (
                    <Link
                      href={buildUrl({ page: String(page - 1) })}
                      className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 hover:bg-gray-50"
                    >
                      Previous
                    </Link>
                  )}
                  {page < totalPages && (
                    <Link
                      href={buildUrl({ page: String(page + 1) })}
                      className="px-3 py-1.5 text-xs rounded-lg bg-xxm-green text-white hover:bg-xxm-green/90"
                    >
                      Next
                    </Link>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Statement shortcut */}
      <div className="bg-xxm-green/5 border border-xxm-green/20 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="font-medium text-xxm-green text-sm">Need a PDF statement?</p>
          <p className="text-xs text-gray-500 mt-0.5">Download a formatted statement for any month</p>
        </div>
        <Link
          href="/dashboard/statements"
          className="px-4 py-2 text-sm rounded-lg bg-xxm-green text-white font-medium hover:bg-xxm-green/90 transition-colors"
        >
          Statements
        </Link>
      </div>
    </div>
  )
}
