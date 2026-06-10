'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Label'
import { formatZAR } from '@/lib/formatters'

export interface BudgetGuardDetails {
  budget: number
  alreadyContributed: number
  remaining: number
  overage: number
}

interface Props {
  details: BudgetGuardDetails
  loading?: boolean
  onChangeAmount: (remaining: number) => void
  onProceed: (reason?: string) => void
  onClose: () => void
}

export function BudgetGuardModal({ details, loading, onChangeAmount, onProceed, onClose }: Props) {
  const [reason, setReason] = useState('')

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-xxm-green-900">Budget limit reached</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-500">
            This contribution would take you over the monthly budget you set for yourself.
          </p>

          <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Your monthly budget</span>
              <span className="font-semibold text-xxm-green-900">{formatZAR(details.budget)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Already contributed</span>
              <span className="font-semibold text-xxm-green-900">{formatZAR(details.alreadyContributed)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Remaining before this payment</span>
              <span className="font-semibold text-xxm-green-900">{formatZAR(details.remaining)}</span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-amber-200">
              <span className="text-amber-700 font-medium">Over budget by</span>
              <span className="font-bold text-amber-700">{formatZAR(details.overage)}</span>
            </div>
          </div>

          <div>
            <Label htmlFor="budget-override-reason">Reason (optional)</Label>
            <textarea
              id="budget-override-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="e.g. Catching up on a missed month"
              className="w-full rounded-xl border border-xxm-gray-200 text-sm p-3 outline-none transition-all duration-150 focus:border-xxm-green focus:ring-2 focus:ring-xxm-green/15"
            />
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => onChangeAmount(details.remaining)}
              disabled={loading}
            >
              ← Change amount
            </Button>
            <Button
              type="button"
              className="w-full"
              loading={loading}
              onClick={() => onProceed(reason || undefined)}
            >
              Proceed anyway →
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
