'use client'

import { useState } from 'react'
import { formatZAR } from '@/lib/formatters'
import { ContributionStatusBadge } from './StatusBadge'
import { PaymentModal } from './PaymentModal'
import { Button } from '@/components/ui/Button'
import { ChevronDown, ArrowUpCircle } from 'lucide-react'

type Transaction = {
  id: string
  amount: string | number
  type: string
  status: string
  createdAt: string | Date
}

export type ContributionData = {
  id: string
  periodMonth: number
  periodYear: number
  amountDue: string | number
  amountPaid: string | number
  dueDate: string | Date
  status: string
  transactions: Transaction[]
}

export type MandateInfo = {
  bankName: string
  accountNumberMasked: string
} | null

const PAYABLE = new Set(['PENDING', 'PARTIAL', 'OVERDUE'])

const TX_STATUS_COLORS: Record<string, string> = {
  SUCCESS: 'text-xxm-green',
  PENDING: 'text-amber-600',
  PROCESSING: 'text-sky-600',
  FAILED: 'text-red-600',
  REVERSED: 'text-xxm-gray-400 line-through',
}

/** Dot colour per status — the row's status cue before you read a word. */
const STATUS_DOT: Record<string, string> = {
  PAID: 'bg-xxm-green',
  PARTIAL: 'bg-sky-500',
  PENDING: 'bg-amber-500',
  OVERDUE: 'bg-red-500',
  WAIVED: 'bg-xxm-gray-300',
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * The ledger: one card, grouped by year, one row per period.
 *
 * ── Why a row is not a card ────────────────────────────────────────────────
 *
 * Elevation belongs to the list, not to each row. A row has no rounding, no
 * clip and no shadow of its own — twelve independently clipped and shadowed
 * boxes down a scrolling viewport is work a phone GPU does not need to do, and
 * the visual result is worse besides: twelve competing objects instead of one
 * legible table.
 *
 * ── Why the year headings ──────────────────────────────────────────────────
 *
 * Every row used to repeat its year: "August 2026", "July 2026", "June 2026".
 * The year is the same for eleven rows out of twelve and changes once — which
 * makes it a heading, not a column. Hoisting it removes the repetition and
 * gives the list the one structural cue it was missing.
 */
export function ContributionLedger({
  contributions,
  mandate,
}: {
  contributions: ContributionData[]
  mandate: MandateInfo
}) {
  // Grouped in the order received — the service already sorts newest first, and
  // re-sorting here would silently disagree with the pagination.
  const groups: { year: number; items: ContributionData[] }[] = []
  for (const c of contributions) {
    const last = groups[groups.length - 1]
    if (last && last.year === c.periodYear) last.items.push(c)
    else groups.push({ year: c.periodYear, items: [c] })
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-xxm-green/8 bg-white shadow-xxm-sm sm:shadow-xxm">
      {groups.map((group, gi) => (
        <section key={group.year} aria-label={`${group.year} contributions`}>
          <h3
            className={`flex items-baseline justify-between gap-3 bg-xxm-gray-50 px-4 py-2.5 sm:px-5 ${
              gi === 0 ? '' : 'border-t border-xxm-gray-100'
            } border-b border-xxm-gray-100`}
          >
            <span className="stat-number text-[13px] font-extrabold tracking-tight text-xxm-green-900">
              {group.year}
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-xxm-gray-400">
              {group.items.length} {group.items.length === 1 ? 'period' : 'periods'}
            </span>
          </h3>
          <div className="divide-y divide-xxm-gray-100">
            {group.items.map((c) => (
              <LedgerRow key={c.id} contribution={c} mandate={mandate} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function LedgerRow({
  contribution,
  mandate,
}: {
  contribution: ContributionData
  mandate: MandateInfo
}) {
  const [expanded, setExpanded] = useState(false)
  const [showPay, setShowPay] = useState(false)

  const canPay = PAYABLE.has(contribution.status) && !!mandate
  const due = Number(contribution.amountDue)
  const paid = Number(contribution.amountPaid)
  const progress = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : 0
  const isFullyPaid = contribution.status === 'PAID' || contribution.status === 'WAIVED'
  const month = MONTHS[contribution.periodMonth - 1] ?? `Month ${contribution.periodMonth}`

  return (
    <div className="transition-colors sm:hover:bg-xxm-green-50/40">
      {/*
        A real <button>: keyboard activation, focus handling and the right
        semantics for free, where a div with role="button" only ever listened
        for Enter and ignored Space.
      */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full px-4 py-3.5 text-left outline-none focus-visible:bg-xxm-green-50 sm:px-5 sm:py-4"
      >
        <div className="flex items-center gap-3">
          {/* A 6px dot instead of a 40px gradient tile. Twelve identical
              wallet icons carried no information and ate the row's width —
              the dot says the one thing that differs: status. */}
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              STATUS_DOT[contribution.status] ?? 'bg-xxm-gray-300'
            }`}
            aria-hidden
          />

          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-bold text-xxm-green-900">{month}</span>
              {/* The amount is visible on mobile. It used to be `hidden sm:block`
                  — on the page whose entire purpose is showing what you have
                  paid, phone users could not see it without expanding a row. */}
              <span className="stat-number shrink-0 text-sm font-bold text-xxm-green-900">
                {formatZAR(paid)}
              </span>
            </span>
            <span className="mt-0.5 flex items-baseline justify-between gap-2">
              <span className="truncate text-[11px] text-xxm-gray-400">
                Due {new Date(contribution.dueDate).toLocaleDateString('en-ZA')}
              </span>
              <span className="stat-number shrink-0 text-[11px] text-xxm-gray-400">
                of {formatZAR(due)}
              </span>
            </span>
          </span>

          <ChevronDown
            size={15}
            className={`shrink-0 text-xxm-gray-300 sm:transition-transform sm:duration-slow ${
              expanded ? 'rotate-180' : ''
            }`}
            aria-hidden
          />
        </div>

        {/* `transition-[width]`, never `transition-all` — `all` would arm a
            transform transition on every row in a scrolling list. */}
        {!isFullyPaid && (
          <span className="mt-3 block h-1 w-full overflow-hidden rounded-full bg-xxm-gray-100">
            <span
              className="block h-full rounded-full bg-xxm-green transition-[width] duration-500"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Amount paid"
            />
          </span>
        )}
      </button>

      {/* The status badge and any action share one line under the row, and the
          line is only rendered when it has something to say — a fully paid
          period showed an empty 44px strip before. */}
      {(!isFullyPaid || canPay) && (
        <div className="flex items-center justify-end gap-2.5 px-4 pb-3.5 sm:px-5 sm:pb-4">
          <ContributionStatusBadge status={contribution.status} />
          {canPay && (
            <Button size="sm" variant="outline" onClick={() => setShowPay(true)} className="shrink-0">
              Pay
            </Button>
          )}
        </div>
      )}

      {expanded && (
        <div className="border-t border-xxm-gray-100 bg-xxm-gray-50">
          {contribution.transactions.length === 0 ? (
            <p className="px-4 py-4 text-xs text-xxm-gray-400 sm:px-5">
              No transactions recorded yet.
            </p>
          ) : (
            <ul className="divide-y divide-xxm-gray-100">
              {contribution.transactions.map((tx) => (
                <li
                  key={tx.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <ArrowUpCircle size={14} className="shrink-0 text-xxm-green/60" aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold capitalize text-xxm-gray-700">
                        {tx.type.toLowerCase().replace(/_/g, ' ')}
                      </span>
                      <span className="block text-[10px] text-xxm-gray-400">
                        {new Date(tx.createdAt).toLocaleDateString('en-ZA')}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="stat-number block text-sm font-bold text-xxm-green-900">
                      {formatZAR(tx.amount)}
                    </span>
                    <span
                      className={`block text-[10px] font-semibold ${
                        TX_STATUS_COLORS[tx.status] ?? 'text-xxm-gray-400'
                      }`}
                    >
                      {tx.status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showPay && mandate && (
        <PaymentModal
          contribution={{
            id: contribution.id,
            periodMonth: contribution.periodMonth,
            periodYear: contribution.periodYear,
            amountDue: due,
            amountPaid: paid,
            status: contribution.status,
          }}
          mandateBankName={mandate.bankName}
          mandateAccountMasked={mandate.accountNumberMasked}
          onClose={() => setShowPay(false)}
        />
      )}
    </div>
  )
}
