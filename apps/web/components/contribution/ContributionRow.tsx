'use client'

import { useState } from 'react'
import { formatZAR, formatMonth } from '@/lib/formatters'
import { ContributionStatusBadge } from './StatusBadge'
import { PaymentModal } from './PaymentModal'
import { Button } from '@/components/ui/Button'

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

const TX_STATUS_CLASSES: Record<string, string> = {
  SUCCESS:    'text-green-600',
  PENDING:    'text-amber-600',
  PROCESSING: 'text-blue-600',
  FAILED:     'text-red-600',
  REVERSED:   'text-gray-400 line-through',
}

export function ContributionRow({ contribution, mandate }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [showPay, setShowPay] = useState(false)

  const canPay = PAYABLE.has(contribution.status) && !!mandate
  const progress = Math.min(
    100,
    Math.round((Number(contribution.amountPaid) / Number(contribution.amountDue)) * 100),
  )

  return (
    <>
      <div className="xxm-card overflow-hidden">
        {/* Main row */}
        <div
          className="flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={() => setExpanded((v) => !v)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setExpanded((v) => !v)}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-xxm-green-900">
              {formatMonth(contribution.periodMonth, contribution.periodYear)}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Due {new Date(contribution.dueDate).toLocaleDateString('en-ZA')}
            </p>
          </div>

          <div className="flex items-center gap-3 ml-3 flex-shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold amount text-xxm-green-900">
                {formatZAR(contribution.amountPaid)}
              </p>
              <p className="text-xs text-gray-400">of {formatZAR(contribution.amountDue)}</p>
            </div>

            <ContributionStatusBadge status={contribution.status} />

            {canPay && (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); setShowPay(true) }}
              >
                Pay
              </Button>
            )}

            <span className="text-gray-300 text-lg">{expanded ? '▲' : '▼'}</span>
          </div>
        </div>

        {/* Progress bar */}
        {contribution.status !== 'PAID' && contribution.status !== 'WAIVED' && (
          <div className="h-1 bg-gray-100">
            <div
              className="h-full bg-xxm-green transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Expanded: transaction history */}
        {expanded && contribution.transactions.length > 0 && (
          <div className="border-t border-gray-100 divide-y divide-gray-50">
            {contribution.transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-2.5 bg-gray-50">
                <div>
                  <p className="text-xs font-medium text-gray-600 capitalize">
                    {tx.type.toLowerCase().replace('_', ' ')}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(tx.createdAt).toLocaleDateString('en-ZA')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold amount text-xxm-green-900">
                    {formatZAR(tx.amount)}
                  </p>
                  <p className={`text-xs font-medium ${TX_STATUS_CLASSES[tx.status] ?? 'text-gray-400'}`}>
                    {tx.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {expanded && contribution.transactions.length === 0 && (
          <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
            <p className="text-xs text-gray-400">No transactions recorded yet.</p>
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
