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
import { formatZAR, formatMonth, MIN_CONTRIBUTION_ZAR, MAX_CONTRIBUTION_ZAR, CONTRIBUTION_STEP_ZAR } from '@/lib/formatters'
import { api, ApiClientError } from '@/lib/api'
import { BudgetGuardModal, type BudgetGuardDetails } from './BudgetGuardModal'

type OpenContribution = {
  id: string
  periodMonth: number
  periodYear: number
  amountDue: number
  amountPaid: number
  status: string
}

type PaymentResult = {
  contribution: { id: string; status: string }
  transaction: { id: string; status: string }
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
  const [result, setResult] = useState<PaymentResult | null>(null)
  const [budgetGuard, setBudgetGuard] = useState<BudgetGuardDetails | null>(null)
  const [overriding, setOverriding] = useState(false)

  const remaining = contribution.amountDue - contribution.amountPaid
  const maxPayable = Math.min(remaining, MAX_CONTRIBUTION_ZAR)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<ManualContributionInput>({
    resolver: zodResolver(ManualContributionSchema),
    defaultValues: {
      periodMonth: contribution.periodMonth,
      periodYear: contribution.periodYear,
      amount: Math.min(remaining, MAX_CONTRIBUTION_ZAR),
    },
  })

  const watchedAmount = watch('amount')

  async function submitPayment(data: ManualContributionInput) {
    const res = await api.post<PaymentResult>('/api/v1/contributions/pay', data)
    setResult(res)
    router.refresh()
  }

  async function onSubmit(data: ManualContributionInput) {
    setServerError('')
    try {
      await submitPayment(data)
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.code === 'BUDGET_001' && err.details) {
        setBudgetGuard(err.details as unknown as BudgetGuardDetails)
        return
      }
      const e = err as { message?: string }
      setServerError(e.message ?? 'Payment failed. Please try again.')
    }
  }

  function handleChangeAmount(remainingAmount: number) {
    setValue('amount', Math.max(MIN_CONTRIBUTION_ZAR, Math.min(remainingAmount, maxPayable)))
    setBudgetGuard(null)
  }

  async function handleProceedAnyway(reason?: string) {
    setOverriding(true)
    setServerError('')
    try {
      await submitPayment({
        ...getValues(),
        budgetOverrideConfirmed: true,
        budgetOverrideReason: reason,
      })
      setBudgetGuard(null)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setServerError(e.message ?? 'Payment failed. Please try again.')
      setBudgetGuard(null)
    } finally {
      setOverriding(false)
    }
  }

  function handleClose() {
    setResult(null)
    onClose()
  }

  if (result) {
    const isSuccess = result.transaction.status === 'SUCCESS'
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div className="px-6 py-8 text-center space-y-4">
            <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${isSuccess ? 'bg-xxm-green-100' : 'bg-amber-100'}`}>
              <span className="text-3xl" aria-hidden>{isSuccess ? '✓' : '⌛'}</span>
            </div>
            <h2 className="text-lg font-bold text-xxm-green-900">
              {isSuccess ? 'Payment successful' : 'Payment submitted'}
            </h2>
            <p className="text-sm text-gray-500">
              {isSuccess
                ? `Your payment of ${formatZAR(watchedAmount)} has been processed.`
                : `Your payment of ${formatZAR(watchedAmount)} is being processed. You'll be notified once it's confirmed.`
              }
            </p>
            <p className="text-xs text-gray-400 font-mono">
              Ref: {result.transaction.id.slice(-12).toUpperCase()}
            </p>
            <Button onClick={handleClose} className="w-full" size="lg">
              Done
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
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

        <div className="px-6 py-5 space-y-5">
          {serverError && (
            <Alert variant="error">
              {serverError}
              <p className="text-xs mt-1 opacity-80">
                If this persists, please contact support.
              </p>
            </Alert>
          )}

          <div className="rounded-xl bg-xxm-green-50 border border-xxm-green-100 p-4 space-y-1">
            <p className="text-xs font-medium text-xxm-green-700 uppercase tracking-wide">
              Debit account
            </p>
            <p className="text-sm font-semibold text-xxm-green-900">{mandateBankName}</p>
            <p className="text-xs text-gray-400 font-mono tracking-wider">{mandateAccountMasked}</p>
          </div>

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
            <input type="hidden" {...register('periodMonth', { valueAsNumber: true })} />
            <input type="hidden" {...register('periodYear', { valueAsNumber: true })} />

            <div>
              <Label htmlFor="amount" required>Payment amount (ZAR)</Label>
              <Input
                id="amount"
                type="number"
                min={MIN_CONTRIBUTION_ZAR}
                max={maxPayable}
                step={CONTRIBUTION_STEP_ZAR}
                error={errors.amount?.message}
                {...register('amount', { valueAsNumber: true })}
              />
              <p className="text-xs text-gray-400 mt-1">
                Remaining: <span className="font-medium">{formatZAR(remaining)}</span>
                {remaining > MAX_CONTRIBUTION_ZAR && (
                  <span className="ml-1">(max {formatZAR(MAX_CONTRIBUTION_ZAR)} per payment)</span>
                )}
              </p>
            </div>

            <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
              Pay {formatZAR(watchedAmount || 0)} now
            </Button>
          </form>
        </div>
      </div>

      {budgetGuard && (
        <BudgetGuardModal
          details={budgetGuard}
          loading={overriding}
          onChangeAmount={handleChangeAmount}
          onProceed={handleProceedAnyway}
          onClose={() => setBudgetGuard(null)}
        />
      )}
    </div>
  )
}
