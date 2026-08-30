'use client'

import { useState } from 'react'
import { formatZAR, formatMonth } from '@/lib/formatters'
import { ContributionStatusBadge } from './StatusBadge'
import { PaymentModal } from './PaymentModal'
import { Button } from '@/components/ui/Button'
import { ChevronDown, Wallet, ArrowUpCircle } from 'lucide-react'

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

/**
 * The contribution ledger, as one card of divided rows.
 *
 * ── The single card is load-bearing, not a style choice ─────────────────────
 *
 * Each period used to be its own elevated card: rounded, `overflow-hidden`,
 * shadowed, with a live box-shadow transition. Twelve of those down a
 * scrolling viewport is twelve independently clipped and shadowed boxes for a
 * phone GPU to composite, and this page tore worse the further it scrolled
 * through six rounds of attempted fixes.
 *
 * This is modelled on the transactions list, which carries the same
 * `rounded-3xl` + `shadow-xxm` treatment on **one** card and has never shown
 * the problem. The elevation belongs to the list, not to each row: a row has
 * no rounding, no clip and no shadow of its own. Do not promote rows back into
 * cards.
 */
export function ContributionHistory({
  contributions,
  mandate,
}: {
  contributions: ContributionData[]
  mandate: MandateInfo
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-xxm-green/8 bg-white shadow-xxm-sm sm:shadow-xxm">
      {/* Column header, desktop only — the mobile rows are self-labelling. */}
      <div className="hidden border-b border-xxm-gray-100 bg-xxm-gray-50 px-5 py-2.5 sm:grid sm:grid-cols-[1fr_auto] sm:gap-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-xxm-gray-400">Period</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-xxm-gray-400">
          Paid of due
        </span>
      </div>

      <div className="divide-y divide-xxm-gray-100">
        {contributions.map((c) => (
          <ContributionItem key={c.id} contribution={c} mandate={mandate} />
        ))}
      </div>
    </div>
  )
}

function ContributionItem({
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

  return (
    <>
      {/* `transition-colors` only — never `transition-all`, which would arm a
          transform transition on every row in a scrolling list. */}
      <div className="transition-colors sm:hover:bg-xxm-green-50/40">
        {/*
          A real <button> rather than a div with role="button": it gets keyboard
          activation, focus handling and the correct semantics for free, where
          the hand-rolled version only listened for Enter and ignored Space.
        */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="w-full px-4 py-3.5 text-left outline-none focus-visible:bg-xxm-green-50 sm:px-5 sm:py-4"
        >
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-xxm-green/15 to-xxm-green/5 ring-1 ring-xxm-green/10 sm:h-10 sm:w-10"
              aria-hidden
            >
              <Wallet size={15} className="text-xxm-green" />
            </span>

            {/* Two lines on mobile. The amount used to be `hidden sm:block` —
                on the page whose whole purpose is showing what you have paid,
                phone users could not see it without expanding every row. */}
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-bold text-xxm-green-900">
                  {formatMonth(contribution.periodMonth, contribution.periodYear)}
                </span>
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
              className={`shrink-0 text-xxm-gray-400 transition-transform duration-slow ${
                expanded ? 'rotate-180' : ''
              }`}
              aria-hidden
            />
          </div>

          {/* `transition-[width]`, not `transition-all`: width is the only thing
              that changes, and `all` would arm a transform transition here. */}
          {!isFullyPaid && (
            <span className="mt-3 block h-1.5 w-full overflow-hidden rounded-full bg-xxm-gray-100">
              <span
                className="block h-full rounded-full bg-gradient-to-r from-xxm-green to-xxm-canopy transition-[width] duration-500"
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

        <div className="flex items-center justify-end gap-2.5 px-4 pb-3.5 sm:px-5 sm:pb-4">
          <ContributionStatusBadge status={contribution.status} />
          {canPay && (
            <Button size="sm" onClick={() => setShowPay(true)} className="shrink-0">
              Pay
            </Button>
          )}
        </div>

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
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-xxm-green/10"
                        aria-hidden
                      >
                        <ArrowUpCircle size={13} className="text-xxm-green" />
                      </span>
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
      </div>

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
    </>
  )
}
