'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { ManualContributionSchema, type ManualContributionInput } from '@/lib/validation/contribution'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Alert } from '@/components/ui/Alert'
import { formatZAR, formatMonth, MIN_CONTRIBUTION_ZAR, CONTRIBUTION_STEP_ZAR } from '@/lib/formatters'
import { api } from '@/lib/api'

type OpenContribution = {
  id: string
  periodMonth: number
  periodYear: number
  amountDue: number
  amountPaid: number
  status: string
}

interface Props {
  contribution: OpenContribution
  mandateBankName: string
  mandateAccountMasked: string
  onClose: () => void
}

export function PaymentModal({ contribution, mandateBankName, mandateAccountMasked, onClose }: Props) {
  const router = useRouter()
  const [serverError, setServerError] = useState('')

  const remaining = contribution.amountDue - contribution.amountPaid

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ManualContributionInput>({
    resolver: zodResolver(ManualContributionSchema),
    defaultValues: {
      periodMonth: contribution.periodMonth,
      periodYear: contribution.periodYear,
      amount: remaining,
    },
  })

  async function onSubmit(data: ManualContributionInput) {
    setServerError('')
    try {
      await api.post('/api/v1/contributions/pay', data)
      router.refresh()
      onClose()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setServerError(e.message ?? 'Payment failed. Please try again.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-xxm-green-900">Make a payment</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {formatMonth(contribution.periodMonth, contribution.periodYear)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {serverError && <Alert variant="error">{serverError}</Alert>}

          {/* Debit account info */}
          <div className="rounded-xl bg-xxm-green-50 border border-xxm-green-100 p-4 space-y-1">
            <p className="text-xs font-medium text-xxm-green-700 uppercase tracking-wide">
              Debit account
            </p>
            <p className="text-sm font-semibold text-xxm-green-900">{mandateBankName}</p>
            <p className="text-xs text-gray-400 font-mono tracking-wider">{mandateAccountMasked}</p>
          </div>

          {/* Balance summary */}
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Amount due</span>
            <span className="font-semibold text-xxm-green-900">
              {formatZAR(contribution.amountDue)}
            </span>
          </div>
          {contribution.amountPaid > 0 && (
            <div className="flex justify-between text-sm -mt-3">
              <span className="text-gray-400">Already paid</span>
              <span className="xxm-text-success">{formatZAR(contribution.amountPaid)}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {/* Hidden fields */}
            <input type="hidden" {...register('periodMonth', { valueAsNumber: true })} />
            <input type="hidden" {...register('periodYear', { valueAsNumber: true })} />

            <div>
              <Label htmlFor="amount" required>Payment amount (ZAR)</Label>
              <Input
                id="amount"
                type="number"
                min={MIN_CONTRIBUTION_ZAR}
                max={remaining}
                step={CONTRIBUTION_STEP_ZAR}
                error={errors.amount?.message}
                {...register('amount', { valueAsNumber: true })}
              />
              <p className="text-xs text-gray-400 mt-1">
                Remaining: <span className="font-medium">{formatZAR(remaining)}</span>
              </p>
            </div>

            <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
              Pay {formatZAR(remaining)} now
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
