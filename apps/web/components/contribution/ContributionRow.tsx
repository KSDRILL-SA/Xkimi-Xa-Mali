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
      <div className="group bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm overflow-hidden hover:shadow-xxm hover:border-xxm-green/15 hover:-translate-y-0.5 transition-all duration-slow ease-smooth">

        {/* ── Main row ────────────────────────────────────── */}
        <div
          className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-xxm-green-50/30 transition-colors"
          onClick={() => setExpanded((v) => !v)}
          role="button"
          tabIndex={0}
          aria-expanded={expanded}
          onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
        >
          {/* Period icon */}
          <div className="w-9 h-9 rounded-xl bg-xxm-green-50 flex items-center justify-center shrink-0 transition-transform duration-slow group-hover:scale-110">
            <Wallet size={15} className="text-xxm-green" aria-hidden />
          </div>

          {/* Period info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-xxm-green-900">
              {formatMonth(contribution.periodMonth, contribution.periodYear)}
            </p>
            <p className="text-[11px] text-xxm-gray-400 mt-0.5">
              Due {new Date(contribution.dueDate).toLocaleDateString('en-ZA')}
            </p>
          </div>

          {/* Amount + status */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-xxm-green-900 tabular-nums">
                {formatZAR(contribution.amountPaid)}
              </p>
              <p className="text-[11px] text-xxm-gray-400">of {formatZAR(contribution.amountDue)}</p>
            </div>

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

            <div className="w-6 h-6 rounded-lg bg-xxm-gray-100 flex items-center justify-center">
              {expanded
                ? <ChevronUp size={13} className="text-xxm-gray-500" aria-hidden />
                : <ChevronDown size={13} className="text-xxm-gray-500" aria-hidden />
              }
            </div>
          </div>
        </div>

        {/* ── Progress bar ─────────────────────────────────── */}
        {!isFullyPaid && (
          <div className="h-1 bg-xxm-gray-100 mx-5 mb-3 rounded-full">
            <div
              className="h-full bg-gradient-to-r from-xxm-green to-xxm-canopy rounded-full transition-all duration-500"
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
              <div className="px-5 py-4 bg-xxm-gray-50">
                <p className="text-xs text-xxm-gray-400">No transactions recorded yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-xxm-gray-50">
                {contribution.transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between px-5 py-3 bg-xxm-gray-50 hover:bg-xxm-gray-100/50 transition-colors">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center shrink-0">
                        <ArrowUpCircle size={13} className="text-xxm-green" aria-hidden />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-xxm-gray-700 capitalize">
                          {tx.type.toLowerCase().replace(/_/g, ' ')}
                        </p>
                        <p className="text-[10px] text-xxm-gray-400">
                          {new Date(tx.createdAt).toLocaleDateString('en-ZA')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-xxm-green-900 tabular-nums">
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
