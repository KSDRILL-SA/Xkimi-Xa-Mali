import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatZAR, formatDate } from '@/lib/formatters'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { RouterPagination } from '@/components/ui/RouterPagination'
import { FileText } from 'lucide-react'

export const metadata: Metadata = { title: 'Transactions' }

const PAGE_SIZE = 25

type TxStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'REVERSED'
type TxType   = 'DEBIT_ORDER' | 'MANUAL' | 'REVERSAL' | 'SCHEDULED'

type TxRow = {
  id: string
  period: string
  type: string
  amount: string
  status: string
  statusClass: string
  gatewayRef: string
  date: string
}

const STATUS_CONFIG: Record<TxStatus, { label: string; className: string }> = {
  PENDING:    { label: 'Pending',    className: 'xxm-status-warning' },
  PROCESSING: { label: 'Processing', className: 'xxm-status-pending' },
  SUCCESS:    { label: 'Success',    className: 'xxm-status-success' },
  FAILED:     { label: 'Failed',     className: 'xxm-status-danger'  },
  REVERSED:   { label: 'Reversed',   className: 'xxm-status-info'    },
}

const TYPE_LABELS: Record<TxType, string> = {
  DEBIT_ORDER: 'Debit Order',
  MANUAL:      'Manual',
  REVERSAL:    'Reversal',
  SCHEDULED:   'Scheduled',
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const columns: Column<TxRow>[] = [
  { key: 'period',     header: 'Period',    width: '120px' },
  { key: 'type',       header: 'Type',      width: '120px' },
  { key: 'amount',     header: 'Amount',    align: 'right', render: (r) => <span className="tabular-nums font-semibold">{r.amount}</span> },
  { key: 'status',     header: 'Status',    align: 'center', render: (r) => <span className={r.statusClass} role="status">{r.status}</span> },
  { key: 'gatewayRef', header: 'Reference', render: (r) => <span className="font-mono text-xxm-gray-400">{r.gatewayRef}</span> },
  { key: 'date',       header: 'Date',      align: 'right'  },
]

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; page?: string }>
}) {
  const session = await auth()
  const userId  = session!.user.id
  const params  = await searchParams

  const page = Math.max(1, Number(params.page ?? '1'))
  const skip = (page - 1) * PAGE_SIZE

  const validStatuses: TxStatus[] = ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REVERSED']
  const validTypes: TxType[]       = ['DEBIT_ORDER', 'MANUAL', 'REVERSAL', 'SCHEDULED']

  const statusFilter = params.status && validStatuses.includes(params.status as TxStatus) ? (params.status as TxStatus) : undefined
  const typeFilter   = params.type   && validTypes.includes(params.type as TxType)         ? (params.type   as TxType)   : undefined

  const where = {
    contribution: { userId },
    ...(statusFilter && { status: statusFilter }),
    ...(typeFilter   && { type:   typeFilter }),
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

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { status: statusFilter, type: typeFilter, page: String(page), ...overrides }
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v) })
    return `/dashboard/transactions?${p.toString()}`
  }

  const rows: TxRow[] = txs.map((tx) => {
    const sc = STATUS_CONFIG[tx.status as TxStatus] ?? { label: tx.status, className: 'xxm-status-info' }
    return {
      id:         tx.id,
      period:     `${MONTHS[(tx.contribution.periodMonth ?? 1) - 1]} ${tx.contribution.periodYear}`,
      type:       TYPE_LABELS[tx.type as TxType] ?? tx.type,
      amount:     formatZAR(Number(tx.amount)),
      status:     sc.label,
      statusClass: sc.className,
      gatewayRef: tx.gatewayRef ?? '—',
      date:       formatDate(tx.createdAt),
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-xxm-green-900">Transactions</h1>
        <p className="text-sm text-xxm-gray-500 mt-1">Full payment history for your account</p>
      </div>

      {/* Filters */}
      <div className="xxm-card p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold text-xxm-gray-500 uppercase tracking-wider self-center mr-1">Status</span>
          <Link href={buildUrl({ status: undefined, page: '1' }) as Route} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${!statusFilter ? 'bg-xxm-green text-white' : 'bg-xxm-gray-100 text-xxm-gray-600 hover:bg-xxm-gray-200'}`}>All</Link>
          {validStatuses.map((s) => (
            <Link key={s} href={buildUrl({ status: s, page: '1' }) as Route} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${statusFilter === s ? 'bg-xxm-green text-white' : 'bg-xxm-gray-100 text-xxm-gray-600 hover:bg-xxm-gray-200'}`}>
              {STATUS_CONFIG[s].label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="text-xs font-semibold text-xxm-gray-500 uppercase tracking-wider self-center mr-1">Type</span>
          <Link href={buildUrl({ type: undefined, page: '1' }) as Route} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${!typeFilter ? 'bg-xxm-green text-white' : 'bg-xxm-gray-100 text-xxm-gray-600 hover:bg-xxm-gray-200'}`}>All</Link>
          {validTypes.map((t) => (
            <Link key={t} href={buildUrl({ type: t, page: '1' }) as Route} className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${typeFilter === t ? 'bg-xxm-green text-white' : 'bg-xxm-gray-100 text-xxm-gray-600 hover:bg-xxm-gray-200'}`}>
              {TYPE_LABELS[t]}
            </Link>
          ))}
        </div>
      </div>

      {/* DataTable */}
      <DataTable
        columns={columns}
        data={rows}
        keyExtractor={(r) => r.id}
        striped
        caption="Transaction history"
        emptyState={
          <div className="py-16 text-center text-xxm-gray-400">
            <p className="font-medium">No transactions found</p>
            <p className="text-sm mt-1">Try adjusting your filters</p>
          </div>
        }
      />

      {/* Pagination */}
      {Math.ceil(total / PAGE_SIZE) > 1 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-xxm-gray-500">
            Showing {skip + 1}–{Math.min(skip + PAGE_SIZE, total)} of {total}
          </p>
          <RouterPagination
            totalItems={total}
            itemsPerPage={PAGE_SIZE}
            currentPage={page}
            baseUrl="/dashboard/transactions"
          />
        </div>
      )}

      {/* Statement shortcut */}
      <div className="bg-xxm-green/5 border border-xxm-green/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="font-medium text-xxm-green text-sm">Need a PDF statement?</p>
          <p className="text-xs text-xxm-gray-500 mt-0.5">Download a formatted statement for any month</p>
        </div>
        <Link
          href="/dashboard/statements"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-xl bg-xxm-green text-white font-medium hover:bg-xxm-canopy transition-colors shrink-0 self-start sm:self-auto"
        >
          <FileText size={14} aria-hidden />
          Statements
        </Link>
      </div>
    </div>
  )
}
