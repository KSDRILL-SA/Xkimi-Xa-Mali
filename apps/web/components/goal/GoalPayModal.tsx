'use client'

import { useEffect, useRef, useState } from 'react'
import { ModalPortal } from '@/components/ui/ModalPortal'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { GoalPaymentSchema, MIN_GOAL_PAYMENT, type GoalPaymentInput } from '@/lib/validation/goal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Alert } from '@/components/ui/Alert'
import { formatZAR } from '@/lib/formatters'
import { api, ApiClientError } from '@/lib/api'
import { NETCASH_FEE_BUFFER, debitAmountWithFee } from '@/lib/group-account'

type PayResult = { paymentId: string; status: string; amount: number; goalTitle: string }

interface Props {
  goalId: string
  goalTitle: string
  /** What is still needed to hit the target — used to suggest a sensible amount. */
  remaining: number
  onClose: () => void
}

const QUICK_AMOUNTS = [50, 100, 250, 500]

/**
 * Rendered through a portal, so the dialog is not trapped inside whatever
 * card opened it. The reveal-on-scroll wrapper keeps a transform after it
 * animates, and a transformed ancestor makes `position: fixed` position
 * against that element instead of the viewport — the dialog ended up behind
 * the cards below it, on a page it had just locked the scrolling of.
 */
export function GoalPayModal(props: Props) {
  return (
    <ModalPortal>
      <GoalPayModalContent {...props} />
    </ModalPortal>
  )
}

function GoalPayModalContent({ goalId, goalTitle, remaining, onClose }: Props) {
  const router = useRouter()
  // One token per payment this modal is offering to make. A double tap or a
  // retried request carries the same one and collapses onto the first debit;
  // opening the modal again is a new intent with a new token.
  const paymentToken = useRef<string>(crypto.randomUUID())

  const [serverError, setServerError] = useState('')
  const [needsMandate, setNeedsMandate] = useState(false)
  const [result, setResult] = useState<PayResult | null>(null)

  // Dialog semantics mirror PaymentModal: Escape closes, body scroll locks, and
  // a stray backdrop click never discards an in-progress payment.
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
    formState: { errors, isSubmitting },
  } = useForm<GoalPaymentInput>({
    resolver: zodResolver(GoalPaymentSchema),
    defaultValues: { amount: Math.max(MIN_GOAL_PAYMENT, Math.min(Math.round(remaining) || 100, 500)) },
  })

  // `useWatch` rather than `watch`: the React Compiler cannot memoize the
  // function `useForm` returns and skips compiling the whole component when it
  // sees one. Equivalence on the first render — the only place the two differ —
  // is pinned by `__tests__/form-watch-equivalence.test.tsx`.
  const amount = useWatch({ control, name: 'amount' })

  async function onSubmit(data: GoalPaymentInput) {
    setServerError('')
    setNeedsMandate(false)
    try {
      const res = await api.post<PayResult>(`/api/v1/goals/${goalId}/pay`, {
        ...data,
        idempotencyKey: paymentToken.current,
      })
      setResult(res)
      router.refresh()
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.code === 'CTR_002') {
        setNeedsMandate(true)
        return
      }
      const e = err as { message?: string }
      setServerError(e.message ?? 'Payment failed. Please try again.')
    }
  }

  if (result) {
    const isSuccess = result.status === 'SUCCESS'
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-pay-result-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      >
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
          <div className="px-6 py-8 text-center space-y-4">
            <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center ${isSuccess ? 'bg-xxm-green-100' : 'bg-amber-100'}`}>
              <span className="text-3xl" aria-hidden>{isSuccess ? '🎉' : '⌛'}</span>
            </div>
            <h2 id="goal-pay-result-title" className="text-lg font-bold text-xxm-green-900">
              {isSuccess ? 'Thank you!' : 'Payment submitted'}
            </h2>
            <p className="text-sm text-gray-500">
              {isSuccess
                ? `Your ${formatZAR(result.amount)} toward “${result.goalTitle}” is in. Your badge points just got a boost.`
                : `Your ${formatZAR(result.amount)} toward “${result.goalTitle}” is being processed. We'll confirm once it clears.`}
            </p>
            <p className="text-xs text-gray-400 font-mono">
              Ref: {result.paymentId.slice(-12).toUpperCase()}
            </p>
            <Button onClick={onClose} className="w-full" size="lg">Done</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="goal-pay-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 id="goal-pay-title" className="text-base font-semibold text-xxm-green-900">Chip in extra</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{goalTitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none shrink-0 ml-3"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {needsMandate && (
            <Alert variant="error">
              You need an active debit order before you can chip in.
              <Link href="/dashboard/mandates" className="block mt-1 font-semibold underline">
                Set up your debit order
              </Link>
            </Alert>
          )}
          {serverError && <Alert variant="error">{serverError}</Alert>}

          <p className="text-sm text-gray-500 leading-relaxed">
            This is an extra payment on top of your monthly contribution — it goes
            straight into this goal and counts toward your badges.
          </p>

          {/* `handleSubmit(onSubmit)` is called when the form is submitted, not
              while rendering. React Hook Form's `handleSubmit` reads the field
              refs, and calling it during render is "Cannot access refs during
              render" to the React Compiler — an error, not a warning. Hoisting
              it to a variable does not help; the call is still made at render.
              Deferring it to the event is what actually lets this component be
              compiled, and it is the same handler React would have invoked with
              the same event either way. */}
          <form onSubmit={(e) => { void handleSubmit(onSubmit)(e) }} className="space-y-4" noValidate>
            <div>
              <Label htmlFor="goal-amount" required>Amount (ZAR)</Label>
              <Input
                id="goal-amount"
                type="number"
                min={MIN_GOAL_PAYMENT}
                step={10}
                error={errors.amount?.message}
                {...register('amount', { valueAsNumber: true })}
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {QUICK_AMOUNTS.map((quick) => (
                  <button
                    key={quick}
                    type="button"
                    onClick={() => setValue('amount', quick, { shouldValidate: true })}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      amount === quick
                        ? 'bg-xxm-green text-white'
                        : 'bg-xxm-gray-100 text-xxm-gray-600 hover:bg-xxm-green-50 hover:text-xxm-green-800'
                    }`}
                  >
                    {formatZAR(quick)}
                  </button>
                ))}
              </div>
              {remaining > 0 && (
                <p className="text-xs text-gray-400 mt-2">
                  {formatZAR(remaining)} still needed to reach this goal.
                </p>
              )}
            </div>

            {NETCASH_FEE_BUFFER > 0 && (
              <div className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Toward the goal</span>
                  <span className="font-semibold text-xxm-green-900">{formatZAR(amount || 0)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Netcash processing fee</span>
                  <span className="font-semibold text-amber-700">+{formatZAR(NETCASH_FEE_BUFFER)}</span>
                </div>
                <div className="flex justify-between text-sm pt-1.5 border-t border-gray-200">
                  <span className="font-semibold text-xxm-green-900">Total debited</span>
                  <span className="font-bold text-xxm-green-900">{formatZAR(debitAmountWithFee(amount || 0))}</span>
                </div>
                <p className="text-[10px] text-gray-400 pt-0.5">
                  The fee covers Netcash&rsquo;s per-debit charge so the goal receives your full amount.
                </p>
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
              Pay {formatZAR(debitAmountWithFee(amount || 0))} now
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
