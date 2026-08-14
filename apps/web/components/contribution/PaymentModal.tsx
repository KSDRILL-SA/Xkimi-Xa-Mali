'use client'

import { useEffect, useRef, useState } from 'react'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { ManualContributionSchema, type ManualContributionInput } from '@/lib/validation/contribution'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Alert } from '@/components/ui/Alert'
import { formatZAR, formatMonth, MIN_CONTRIBUTION_ZAR, MAX_CONTRIBUTION_ZAR, CONTRIBUTION_STEP_ZAR } from '@/lib/formatters'
import { api, ApiClientError } from '@/lib/api'
import { NETCASH_FEE_BUFFER, debitAmountWithFee } from '@/lib/group-account'
import { BudgetGuardModal, type BudgetGuardDetails } from './BudgetGuardModal'
import { GroupCollectionAccount } from './GroupCollectionAccount'

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

/**
 * Rendered through a portal, so the dialog is not trapped inside whatever
 * card opened it. The reveal-on-scroll wrapper keeps a transform after it
 * animates, and a transformed ancestor makes `position: fixed` position
 * against that element instead of the viewport — the dialog ended up behind
 * the cards below it, on a page it had just locked the scrolling of.
 */
export function PaymentModal(props: Props) {
  return (
    <ModalPortal>
      <PaymentModalContent {...props} />
    </ModalPortal>
  )
}

function PaymentModalContent({ contribution, mandateBankName, mandateAccountMasked, onClose }: Props) {
  const router = useRouter()
  const [serverError, setServerError] = useState('')
  const [result, setResult] = useState<PaymentResult | null>(null)
  const [budgetGuard, setBudgetGuard] = useState<BudgetGuardDetails | null>(null)
  const [overriding, setOverriding] = useState(false)

  const remaining = contribution.amountDue - contribution.amountPaid
  const maxPayable = Math.min(remaining, MAX_CONTRIBUTION_ZAR)

  // Dialog semantics: Escape closes and body scroll is locked while open. We do
  // NOT dismiss on backdrop click here — an accidental outside click must never
  // discard an in-progress payment.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const {
    register,
    handleSubmit,
    control,
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

  // `useWatch` rather than `watch` — see the note in GoalPayModal, and the
  // first-render equivalence pinned by `__tests__/form-watch-equivalence.test.tsx`.
  const watchedAmount = useWatch({ control, name: 'amount' })

  // One token per payment this modal is offering to make. The same intent
  // submitted twice — a double tap, a retried request — collapses onto the
  // first debit, while opening the modal again is a new intent with a new
  // token. Wired here as well as on the contribute page, because a protection
  // applied to one of two paths to the same endpoint is the failure this
  // repository keeps finding.
  const paymentToken = useRef<string>(crypto.randomUUID())

  async function submitPayment(data: ManualContributionInput) {
    const res = await api.post<PaymentResult>('/api/v1/contributions/pay', {
      ...data,
      idempotencyKey: paymentToken.current,
    })
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
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-result-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      >
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div className="px-6 py-8 text-center space-y-4">
            <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${isSuccess ? 'bg-xxm-green-100' : 'bg-amber-100'}`}>
              <span className="text-3xl" aria-hidden>{isSuccess ? '✓' : '⌛'}</span>
            </div>
            <h2 id="payment-result-title" className="text-lg font-bold text-xxm-green-900">
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 id="payment-modal-title" className="text-base font-semibold text-xxm-green-900">Make a payment</h2>
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

          <GroupCollectionAccount compact />

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

          {/* Called on submit, not during render — see the note in GoalPayModal. */}
          <form onSubmit={(e) => { void handleSubmit(onSubmit)(e) }} className="space-y-4" noValidate>
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

            {NETCASH_FEE_BUFFER > 0 && (
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Contribution</span>
                  <span className="font-semibold text-xxm-green-900">{formatZAR(watchedAmount || 0)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Netcash processing fee</span>
                  <span className="font-semibold text-amber-700">+{formatZAR(NETCASH_FEE_BUFFER)}</span>
                </div>
                <div className="flex justify-between text-sm pt-1.5 border-t border-gray-200">
                  <span className="font-semibold text-xxm-green-900">Total debited</span>
                  <span className="font-bold text-xxm-green-900">{formatZAR(debitAmountWithFee(watchedAmount || 0))}</span>
                </div>
                <p className="text-[10px] text-gray-400 pt-0.5">
                  The fee covers Netcash&rsquo;s per-debit charge so the group receives your full contribution.
                </p>
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
              Pay {formatZAR(debitAmountWithFee(watchedAmount || 0))} now
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
