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
 * ── Rebuilt from scratch, 2026-08-30 ────────────────────────────────────────
 *
 * Each period used to be its own elevated card: rounded, `overflow-hidden`,
 * shadowed, with a live box-shadow transition. Twelve of those down a
 * scrolling viewport is twelve independently clipped and shadowed boxes for a
 * phone GPU to composite, and this page tore worse the further it scrolled.
 *
 * This is modelled on the transactions list, which has never shown the
 * problem: **one** bordered card, with rows separated by a hairline and
 * nothing elevated inside it. A row carries no rounding, no clip and no
 * shadow of its own, so the whole list is a single box to paint rather than
 * one per period.
 */
export function ContributionHistory({
  contributions,
  mandate,
}: {
  contributions: ContributionData[]
  mandate: MandateInfo
}) {
  return (
    <div className="divide-y divide-xxm-gray-100 overflow-hidden rounded-2xl border border-xxm-green/10 bg-white">
      {contributions.map((c) => (
        <ContributionItem key={c.id} contribution={c} mandate={mandate} />
      ))}
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
      <div>
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
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-xxm-green-50" aria-hidden>
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
                <span className="shrink-0 text-sm font-bold tabular-nums text-xxm-green-900">
                  {formatZAR(paid)}
                </span>
              </span>
              <span className="mt-0.5 flex items-baseline justify-between gap-2">
                <span className="truncate text-[11px] text-xxm-gray-400">
                  Due {new Date(contribution.dueDate).toLocaleDateString('en-ZA')}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-xxm-gray-400">
                  of {formatZAR(due)}
                </span>
              </span>
            </span>

            <ChevronDown
              size={15}
              className={`shrink-0 text-xxm-gray-400 ${expanded ? 'rotate-180' : ''}`}
              aria-hidden
            />
          </div>

          {/* Progress: a flat track, no gradient. Its own line so nothing above
              gets squeezed on a narrow screen. */}
          {!isFullyPaid && (
            <span className="mt-3 block h-1 w-full rounded-full bg-xxm-gray-100">
              <span
                className="block h-full rounded-full bg-xxm-green"
                style={{ width: `${progress}%` }}
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
                  <li key={tx.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white" aria-hidden>
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
                      <span className="block text-sm font-bold tabular-nums text-xxm-green-900">
                        {formatZAR(tx.amount)}
                      </span>
                      <span className={`block text-[10px] font-semibold ${TX_STATUS_COLORS[tx.status] ?? 'text-xxm-gray-400'}`}>
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
