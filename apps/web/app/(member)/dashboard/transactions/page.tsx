import type { Metadata } from 'next'
import type { Route } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { formatZAR, formatDate } from '@/lib/formatters'
import { RouterPagination } from '@/components/ui/RouterPagination'
import { Reveal } from '@xxm/ui'
import { FileText, ArrowUpCircle } from 'lucide-react'
import { getTransactionHistory } from '@/services/report.service'

export const metadata: Metadata = { title: 'Transactions' }

const PAGE_SIZE = 25

type TxStatus = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'REVERSED'
type TxType   = 'DEBIT_ORDER' | 'MANUAL' | 'REVERSAL' | 'SCHEDULED'

const STATUS_CONFIG: Record<TxStatus, { label: string; dot: string; badge: string }> = {
  PENDING:    { label: 'Pending',    dot: 'bg-amber-500',     badge: 'bg-amber-100 text-amber-700'           },
  PROCESSING: { label: 'Processing', dot: 'bg-sky-500',       badge: 'bg-sky-100 text-sky-700'               },
  SUCCESS:    { label: 'Success',    dot: 'bg-xxm-green',     badge: 'bg-xxm-green-100 text-xxm-green-700'   },
  FAILED:     { label: 'Failed',     dot: 'bg-red-500',       badge: 'bg-red-100 text-red-700'               },
  REVERSED:   { label: 'Reversed',   dot: 'bg-xxm-gray-400', badge: 'bg-xxm-gray-100 text-xxm-gray-600'     },
}

const TYPE_LABELS: Record<TxType, string> = {
  DEBIT_ORDER: 'Debit Order',
  MANUAL:      'Manual',
  REVERSAL:    'Reversal',
  SCHEDULED:   'Scheduled',
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; page?: string }>
}) {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')
  const userId  = session.user.id
  const roles   = (session.user.roles as string[] | undefined) ?? []
  const params  = await searchParams

  // Clamped by getTransactionHistory as well; done here too so the pagination
  // links and the "page N of M" text agree with the rows actually shown.
  const requestedPage = Number(params.page ?? '1')
  const page = Number.isFinite(requestedPage) ? Math.max(1, Math.floor(requestedPage)) : 1
  const skip = (page - 1) * PAGE_SIZE

  const validStatuses: TxStatus[] = ['PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'REVERSED']
  const validTypes: TxType[]       = ['DEBIT_ORDER', 'MANUAL', 'REVERSAL', 'SCHEDULED']

  const statusFilter = params.status && validStatuses.includes(params.status as TxStatus) ? (params.status as TxStatus) : undefined
  const typeFilter   = params.type   && validTypes.includes(params.type as TxType)         ? (params.type   as TxType)   : undefined

  const { items: txs, total } = await getTransactionHistory(userId, userId, roles, {
    status: statusFilter,
    type: typeFilter,
    page,
    limit: PAGE_SIZE,
  })

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const p = new URLSearchParams()
    const merged = { status: statusFilter, type: typeFilter, page: String(page), ...overrides }
    Object.entries(merged).forEach(([k, v]) => { if (v) p.set(k, v) })
    return `/dashboard/transactions?${p.toString()}`
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────── */}
      <Reveal variant="up" className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-xxm-green/15 to-xxm-green/5 flex items-center justify-center shrink-0 ring-1 ring-xxm-green/10">
            <ArrowUpCircle size={22} className="text-xxm-green" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">Transactions</h1>
            <p className="text-sm text-xxm-gray-500 mt-1">Full payment history for your account</p>
          </div>
        </div>
        {total > 0 && (
          <div className="inline-flex items-center gap-2 rounded-2xl bg-white border border-xxm-green/10 shadow-xxm-sm px-4 py-2 shrink-0">
            <span className="stat-number text-xl font-black text-xxm-green-900">{total}</span>
            <span className="text-[11px] text-xxm-gray-400 leading-tight">total<br />records</span>
          </div>
        )}
      </Reveal>

      {/* ── Filters ────────────────────────────────── */}
      <Reveal variant="up" delay={100} className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest w-10 shrink-0">Status</span>
          <FilterPill label="All" href={buildUrl({ status: undefined, page: '1' }) as Route} active={!statusFilter} />
          {validStatuses.map((s) => (
            <FilterPill key={s} label={STATUS_CONFIG[s].label} href={buildUrl({ status: s, page: '1' }) as Route} active={statusFilter === s} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest w-10 shrink-0">Type</span>
          <FilterPill label="All" href={buildUrl({ type: undefined, page: '1' }) as Route} active={!typeFilter} />
          {validTypes.map((t) => (
            <FilterPill key={t} label={TYPE_LABELS[t]} href={buildUrl({ type: t, page: '1' }) as Route} active={typeFilter === t} />
          ))}
        </div>
      </Reveal>

      {/* ── Transaction list ───────────────────────── */}
      <Reveal variant="up" delay={200}>
      {txs.length === 0 ? (
        <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-14 text-center">
          <div className="w-16 h-16 rounded-3xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-4">
            <ArrowUpCircle size={26} className="text-xxm-green/40" aria-hidden />
          </div>
          <p className="text-xxm-green-900 font-bold">No transactions found</p>
          <p className="text-xxm-gray-400 text-xs mt-1.5">Try adjusting your filters above.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden">
          {/* Column header */}
          <div className="hidden sm:grid grid-cols-[1fr_100px_100px_140px_1fr_90px] gap-3 px-5 py-2.5 bg-xxm-gray-50 border-b border-xxm-gray-100">
            <span className="text-[10px] font-bold text-xxm-gray-400 uppercase tracking-widest">Period</span>
            <span className="text-[10px] font-bold text-xxm-gray-400 uppercase tracking-widest">Type</span>
            <span className="text-[10px] font-bold text-xxm-gray-400 uppercase tracking-widest text-right">Amount</span>
            <span className="text-[10px] font-bold text-xxm-gray-400 uppercase tracking-widest">Status</span>
            <span className="text-[10px] font-bold text-xxm-gray-400 uppercase tracking-widest">Reference</span>
            <span className="text-[10px] font-bold text-xxm-gray-400 uppercase tracking-widest text-right">Date</span>
          </div>

          <div className="divide-y divide-xxm-gray-50">
            {txs.map((tx) => {
              const sc = STATUS_CONFIG[tx.status as TxStatus] ?? { label: tx.status, dot: 'bg-xxm-gray-400', badge: 'bg-xxm-gray-100 text-xxm-gray-600' }
              const period = tx.period
              return (
                <div key={tx.id} className="group flex sm:grid sm:grid-cols-[1fr_100px_100px_140px_1fr_90px] gap-3 items-center px-5 py-4 hover:bg-xxm-green-50/20 transition-colors flex-wrap">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-xxm-green-50 flex items-center justify-center shrink-0 transition-transform duration-slow group-hover:scale-110">
                      <ArrowUpCircle size={13} className="text-xxm-green" aria-hidden />
                    </div>
                    <span className="text-sm font-semibold text-xxm-green-900 truncate">{period}</span>
                  </div>
                  <span className="text-xs text-xxm-gray-600 hidden sm:block">
                    {TYPE_LABELS[tx.type as TxType] ?? tx.type}
                  </span>
                  <span className="stat-number text-sm font-bold text-xxm-green-900 text-right hidden sm:block">
                    {formatZAR(tx.amount)}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 ${sc.badge}`}
                    role="status"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} aria-hidden />
                    {sc.label}
                  </span>
                  <span className="font-mono text-[11px] text-xxm-gray-400 hidden sm:block truncate">
                    {tx.gatewayRef ?? '—'}
                  </span>
                  <span className="text-xs text-xxm-gray-400 hidden sm:block text-right">
                    {formatDate(tx.createdAt)}
                  </span>
                  {/* The stated reason for a reversing entry. Shown to the
                      member because a correction they cannot read the cause of
                      is not the honest history the Foundation promises — and
                      this is the screen they actually look at. Spans the full
                      row so a long reason wraps rather than truncating. */}
                  {tx.reversalReason && (
                    <p className="w-full sm:col-span-6 text-xs text-xxm-gray-500 sm:pl-[38px] sm:-mt-1">
                      <span className="font-semibold text-xxm-gray-600">Reason for reversal: </span>
                      {tx.reversalReason}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      </Reveal>

      {/* ── Pagination ─────────────────────────────── */}
      {totalPages > 1 && (
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

      {/* ── Statement shortcut ─────────────────────── */}
      <Reveal variant="up" delay={300} className="relative overflow-hidden bg-gradient-to-br from-xxm-green to-xxm-canopy rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xxm">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/4 pointer-events-none" aria-hidden />
        <div className="relative z-10 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
            <FileText size={18} className="text-xxm-gold" aria-hidden />
          </div>
          <div>
            <p className="font-bold text-white text-sm">Need a PDF statement?</p>
            <p className="text-xs text-green-100/70 mt-0.5">Download a premium formatted statement for any contribution month.</p>
          </div>
        </div>
        <Link
          href="/dashboard/statements"
          className="relative z-10 inline-flex items-center gap-2 px-5 py-2.5 text-sm rounded-2xl bg-xxm-gold text-xxm-green-900 font-bold hover:bg-xxm-gold-light hover:-translate-y-0.5 transition-all duration-fast ease-smooth shadow-gold-sm shrink-0 self-start sm:self-auto"
        >
          <FileText size={14} aria-hidden />
          View statements
        </Link>
      </Reveal>
    </div>
  )
}

function FilterPill({ label, href, active }: { label: string; href: Route; active: boolean }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
        active
          ? 'bg-xxm-green text-white shadow-sm'
          : 'bg-xxm-gray-100 text-xxm-gray-600 hover:bg-xxm-gray-200'
      }`}
    >
      {label}
    </Link>
  )
}
