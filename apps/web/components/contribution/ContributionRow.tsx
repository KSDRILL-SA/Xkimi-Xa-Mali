'use client'

import { useState } from 'react'
import { formatZAR, formatMonth } from '@/lib/formatters'
import { ContributionStatusBadge } from './StatusBadge'
import { PaymentModal } from './PaymentModal'
import { Button } from '@/components/ui/Button'
import { ChevronDown, ChevronUp, Wallet, ArrowUpCircle } from 'lucide-react'

type Transaction = {
  id: string
  amount: string | number
  type: string
  status: string
  createdAt: string | Date
}

type ContributionData = {
  id: string
  periodMonth: number
  periodYear: number
  amountDue: string | number
  amountPaid: string | number
  dueDate: string | Date
  status: string
  transactions: Transaction[]
}

type MandateInfo = {
  bankName: string
  accountNumberMasked: string
} | null

interface Props {
  contribution: ContributionData
  mandate: MandateInfo
}

const PAYABLE = new Set(['PENDING', 'PARTIAL', 'OVERDUE'])

const TX_STATUS_COLORS: Record<string, string> = {
  SUCCESS:    'text-xxm-green',
  PENDING:    'text-amber-600',
  PROCESSING: 'text-sky-600',
  FAILED:     'text-red-600',
  REVERSED:   'text-xxm-gray-400 line-through',
}

export function ContributionRow({ contribution, mandate }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [showPay, setShowPay] = useState(false)

  const canPay = PAYABLE.has(contribution.status) && !!mandate
  const progress = Math.min(
    100,
    Math.round((Number(contribution.amountPaid) / Number(contribution.amountDue)) * 100),
  )
  const isFullyPaid = contribution.status === 'PAID' || contribution.status === 'WAIVED'

  return (
    <>
      {/*
        No shadow and no shadow transition on mobile — both are `sm:` only.

        This is the difference between this list and the transaction list,
        which never showed the tearing reported here. A transaction row is a
        plain div inside one shared card, carrying only `transition-colors`.
        Every contribution row was its own elevated card: `shadow-xxm-sm`,
        rounded corners, `overflow-hidden`, and a live box-shadow transition —
        so a page of twelve rows is twelve independently-shadowed compositing
        layers stacked down a scrolling viewport. That is expensive enough on
        a phone GPU to tear, and it gets worse the further you scroll, which
        matches the report exactly.

        On mobile the rows now separate by border alone, which is what the
        transaction list already does. The shadow, the hover lift and the
        shadow transition all return at `sm:`, where there is a pointer to
        justify them and a GPU that is not being asked to composite a dozen
        shadowed layers at once. Desktop is visually unchanged.
      */}
      <div className="group overflow-hidden rounded-2xl border border-xxm-green/8 bg-white sm:shadow-xxm-sm sm:transition-[box-shadow,border-color] sm:duration-slow sm:ease-smooth sm:hover:shadow-xxm sm:hover:border-xxm-green/15">

        {/* ── Main row ────────────────────────────────────── */}
        {/*
          Mobile-first two-line layout. Previously the amount was
          `hidden sm:block` — on the page whose entire purpose is showing what
          you have paid, phone users could not see the amount at all without
          expanding each row. Now the period and amount share the first line,
          the due date and status share the second, and nothing is dropped;
          `sm:` restores the original single-line arrangement where the width
          exists for it.
        */}
        <div
          className="cursor-pointer px-4 py-3.5 transition-colors sm:px-5 sm:py-4 sm:hover:bg-xxm-green-50/30"
          onClick={() => setExpanded((v) => !v)}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
        >
          <div className="flex items-center gap-3">
            {/* Period icon */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-xxm-green-50 transition-transform duration-slow sm:group-hover:scale-110">
              <Wallet size={15} className="text-xxm-green" aria-hidden />
            </div>

            {/* Period + amount */}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-bold text-xxm-green-900">
                  {formatMonth(contribution.periodMonth, contribution.periodYear)}
                </p>
                <p className="shrink-0 text-sm font-bold tabular-nums text-xxm-green-900">
                  {formatZAR(contribution.amountPaid)}
                </p>
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-2">
                <p className="truncate text-[11px] text-xxm-gray-400">
                  Due {new Date(contribution.dueDate).toLocaleDateString('en-ZA')}
                </p>
                <p className="shrink-0 text-[11px] tabular-nums text-xxm-gray-400">
                  of {formatZAR(contribution.amountDue)}
                </p>
              </div>
            </div>

            {/* Chevron — always visible, so the row reads as expandable */}
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-xxm-gray-100">
              {expanded
                ? <ChevronUp size={13} className="text-xxm-gray-500" aria-hidden />
                : <ChevronDown size={13} className="text-xxm-gray-500" aria-hidden />
              }
            </div>
          </div>

          {/* Status + pay action. Its own line on mobile so neither the badge
              nor the button squeezes the amounts above; folded back up beside
              them from `sm:`. */}
          <div className="mt-2.5 flex items-center justify-end gap-2.5 sm:mt-2">
            <ContributionStatusBadge status={contribution.status} />
            {canPay && (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); setShowPay(true) }}
                className="shrink-0"
              >
                Pay
              </Button>
            )}
          </div>
        </div>

        {/* ── Progress bar ─────────────────────────────────── */}
        {!isFullyPaid && (
          <div className="mx-4 mb-3 h-1 rounded-full bg-xxm-gray-100 sm:mx-5">
            {/* `transition-[width]`, not `transition-all`: width is the only
                thing that ever changes here, and `all` would arm a transform
                transition on an element inside a `<Reveal>` that is animating
                one. */}
            <div
              className="h-full rounded-full bg-gradient-to-r from-xxm-green to-xxm-canopy transition-[width] duration-500"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        )}

        {/* ── Expanded: transactions ───────────────────────── */}
        {expanded && (
          <div className="border-t border-xxm-gray-100">
            {contribution.transactions.length === 0 ? (
              <div className="bg-xxm-gray-50 px-4 py-4 sm:px-5">
                <p className="text-xs text-xxm-gray-400">No transactions recorded yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-xxm-gray-50">
                {contribution.transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between gap-3 bg-xxm-gray-50 px-4 py-3 transition-colors sm:px-5 sm:hover:bg-xxm-gray-100/50"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white">
                        <ArrowUpCircle size={13} className="text-xxm-green" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold capitalize text-xxm-gray-700">
                          {tx.type.toLowerCase().replace(/_/g, ' ')}
                        </p>
                        <p className="text-[10px] text-xxm-gray-400">
                          {new Date(tx.createdAt).toLocaleDateString('en-ZA')}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold tabular-nums text-xxm-green-900">
                        {formatZAR(tx.amount)}
                      </p>
                      <p className={`text-[10px] font-semibold ${TX_STATUS_COLORS[tx.status] ?? 'text-xxm-gray-400'}`}>
                        {tx.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
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
            amountDue: Number(contribution.amountDue),
            amountPaid: Number(contribution.amountPaid),
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
