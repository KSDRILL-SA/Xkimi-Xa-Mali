'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { ManualContributionSchema, type ManualContributionInput } from '@/lib/validation/contribution'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Alert } from '@/components/ui/Alert'
import { api, ApiClientError } from '@/lib/api'
import { BudgetGuardModal, type BudgetGuardDetails } from '@/components/contribution/BudgetGuardModal'
import { SkeletonForm } from '@/components/ui/Skeleton'
import { formatZAR, formatMonth, MIN_CONTRIBUTION_ZAR, CONTRIBUTION_STEP_ZAR } from '@/lib/formatters'
import { Reveal } from '@xxm/ui'
import { Wallet, CreditCard, CheckCircle2, AlertTriangle } from 'lucide-react'

type OpenPeriod = {
  id?: string
  periodMonth: number
  periodYear: number
  amountDue: number
  amountPaid: number
  status: string
}

type MandateInfo = {
  bankName: string
  accountNumberMasked: string
  amount: number
}

export default function ContributePage() {
  const router = useRouter()
  const [openPeriods, setOpenPeriods] = useState<OpenPeriod[]>([])
  const [mandate, setMandate] = useState<MandateInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [serverError, setServerError] = useState('')
  const [success, setSuccess] = useState(false)
  const [budgetGuard, setBudgetGuard] = useState<BudgetGuardDetails | null>(null)
  const [pending, setPending] = useState<ManualContributionInput | null>(null)
  const [overriding, setOverriding] = useState(false)

  // Cleared on unmount. A member who navigates away inside the redirect window
  // otherwise gets pushed to a page they had already left.
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (redirectTimer.current) clearTimeout(redirectTimer.current)
  }, [])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ManualContributionInput>({
    resolver: zodResolver(ManualContributionSchema),
    defaultValues: { amount: MIN_CONTRIBUTION_ZAR },
  })

  const selectedMonth = watch('periodMonth')
  const selectedYear = watch('periodYear')
  const selectedPeriod = openPeriods.find(
    (p) => p.periodMonth === Number(selectedMonth) && p.periodYear === Number(selectedYear),
  )
  const remaining = selectedPeriod
    ? selectedPeriod.amountDue - selectedPeriod.amountPaid
    : mandate?.amount ?? MIN_CONTRIBUTION_ZAR

  useEffect(() => {
    if (remaining > 0) setValue('amount', remaining)
  }, [selectedMonth, selectedYear, remaining, setValue])

  useEffect(() => {
    async function load() {
      try {
        type ContribItem = { periodMonth: number; periodYear: number; amountDue: number; amountPaid: number; status: string }
        type MandateItem = { status: string; amount: string | number; bankAccount: { bankName: string; accountNumberMasked: string } }

        const [contribs, mandates] = await Promise.all([
          api.get<ContribItem[]>('/api/v1/contributions'),
          api.get<MandateItem[]>('/api/v1/mandates'),
        ])

        const open = contribs
          .filter((c) => ['PENDING', 'PARTIAL', 'OVERDUE'].includes(c.status))
          .map((c) => ({
            ...c,
            amountDue: Number(c.amountDue),
            amountPaid: Number(c.amountPaid),
          }))

        const now = new Date()
        const currentExists = open.some(
          (p) => p.periodMonth === now.getMonth() + 1 && p.periodYear === now.getFullYear(),
        )
        if (!currentExists) {
          open.unshift({
            periodMonth: now.getMonth() + 1,
            periodYear: now.getFullYear(),
            amountDue: 0,
            amountPaid: 0,
            status: 'PENDING',
          })
        }

        setOpenPeriods(open)
        if (open[0]) {
          setValue('periodMonth', open[0].periodMonth)
          setValue('periodYear', open[0].periodYear)
        }

        const active = mandates.find((m) => m.status === 'ACTIVE')
        if (active) {
          setMandate({
            bankName: active.bankAccount.bankName,
            accountNumberMasked: active.bankAccount.accountNumberMasked,
            amount: Number(active.amount),
          })
        }
      } catch {
        setServerError('Failed to load data. Please refresh.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [setValue])

  /**
   * Submit a payment, and deal with the two answers that are not "done".
   *
   * `BUDGET_001` is a refusal the member can resolve, and this page had no way
   * to. `submitManualPayment` throws it whenever the amount takes them past a
   * budget they set themselves, unless `budgetOverrideConfirmed` is sent — and
   * this form never sent it and never offered the modal that collects it. So a
   * member over their own budget, on the page titled "Make a Payment", was told
   * they had exceeded it and given nothing to click. `PaymentModal` had handled
   * this correctly since it was written; this page simply never adopted it.
   *
   * A declined collection is the other one. See {@link finish}.
   */
  async function pay(data: ManualContributionInput) {
    const result = await api.post<{ status?: string }>('/api/v1/contributions/pay', data)
    finish(result?.status)
  }

  /**
   * What the member is told once the gateway has answered.
   *
   * "Payment submitted!" used to be shown for every response that did not
   * throw — including a decline, which the service wrote as PENDING and which
   * nothing would ever have corrected. A refusal by the bank is not a
   * submission, and the member is standing right here to be told so.
   */
  function finish(status?: string) {
    if (status === 'FAILED') {
      setServerError(
        'Your bank refused this payment. Nothing has been taken from your account. ' +
        'Check your available balance and try again, or contact your bank.',
      )
      return
    }
    setSuccess(true)
    redirectTimer.current = setTimeout(() => router.push('/dashboard/contributions'), 1500)
  }

  async function onSubmit(data: ManualContributionInput) {
    setServerError('')
    setPending(data)
    try {
      await pay(data)
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.code === 'BUDGET_001' && err.details) {
        setBudgetGuard(err.details as unknown as BudgetGuardDetails)
        return
      }
      const e = err as { message?: string }
      setServerError(e.message ?? 'Payment failed. Please try again.')
    }
  }

  /** Drop the amount to what is left in the budget, and let them submit again. */
  function applyRemainingBudget(remainingBudget: number) {
    setValue('amount', remainingBudget, { shouldValidate: true })
    setBudgetGuard(null)
  }

  /** The member has seen what this does to their budget and chosen to go on. */
  async function confirmOverBudget(reason: string) {
    if (!pending) return
    setOverriding(true)
    try {
      await pay({ ...pending, budgetOverrideConfirmed: true, budgetOverrideReason: reason })
      setBudgetGuard(null)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setBudgetGuard(null)
      setServerError(e.message ?? 'Payment failed. Please try again.')
    } finally {
      setOverriding(false)
    }
  }

  if (loading) return <SkeletonForm fields={3} />

  return (
    <div className="max-w-lg space-y-6">

      {/* ── Header ─────────────────────────────────── */}
      <Reveal variant="up" className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-xxm-green/10 flex items-center justify-center shrink-0">
          <Wallet size={22} className="text-xxm-green" aria-hidden />
        </div>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">Make a Payment</h1>
          <p className="text-sm text-xxm-gray-500 mt-1">
            Pay a once-off contribution from your registered bank account.
          </p>
        </div>
      </Reveal>

      {/* ── No mandate error ───────────────────────── */}
      {!mandate && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-red-800">No active mandate</p>
            <p className="text-xs text-red-700 mt-0.5">
              You need an active payment mandate before making a payment.{' '}
              <a href="/dashboard/mandates" className="underline font-bold hover:text-red-900 transition-colors">
                Set up mandate
              </a>
            </p>
          </div>
        </div>
      )}

      {mandate && (
        <>
          {/* ── Debit account card ─────────────────── */}
          <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-xxm-green-50 flex items-center justify-center shrink-0">
              <CreditCard size={18} className="text-xxm-green" aria-hidden />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest mb-0.5">Debit account</p>
              <p className="text-sm font-bold text-xxm-green-900">{mandate.bankName}</p>
              <p className="text-xs text-xxm-gray-400 font-mono tracking-wider">{mandate.accountNumberMasked}</p>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-xxm-green-100 text-xxm-green-700 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-xxm-green" aria-hidden />
              Active
            </span>
          </div>

          {/* ── Success state ──────────────────────── */}
          {success ? (
            <div className="bg-white rounded-2xl border border-xxm-green/20 shadow-xxm-sm p-8 text-center space-y-3 animate-scale-in">
              <div className="w-14 h-14 rounded-2xl bg-xxm-green-50 flex items-center justify-center mx-auto animate-scale-in">
                <CheckCircle2 size={28} className="text-xxm-green" aria-hidden />
              </div>
              <p className="font-display text-lg font-extrabold text-xxm-green-900">Payment submitted!</p>
              <p className="text-sm text-xxm-gray-500">Redirecting to your contributions...</p>
            </div>
          ) : (
            /* ── Payment form ──────────────────────── */
            <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-xxm-gray-100 bg-xxm-green-50/30">
                <h2 className="text-base font-bold text-xxm-green-900">Payment details</h2>
              </div>
              <div className="p-5">
                {serverError && <Alert variant="error" className="mb-4">{serverError}</Alert>}
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
                  <div>
                    <Label htmlFor="period" required>Period</Label>
                    <Select
                      id="period"
                      value={`${watch('periodYear')}-${watch('periodMonth')}`}
                      onChange={(e) => {
                        const [y, m] = e.target.value.split('-').map(Number)
                        if (y === undefined || m === undefined) return
                        setValue('periodMonth', m, { shouldValidate: true })
                        setValue('periodYear', y, { shouldValidate: true })
                      }}
                      error={errors.periodMonth?.message ?? errors.periodYear?.message}
                    >
                      {openPeriods.map((p) => (
                        <option key={`${p.periodYear}-${p.periodMonth}`} value={`${p.periodYear}-${p.periodMonth}`}>
                          {formatMonth(p.periodMonth, p.periodYear)}
                          {p.status !== 'PENDING' ? ` (${p.status})` : ''}
                        </option>
                      ))}
                    </Select>
                  </div>

                  {selectedPeriod && selectedPeriod.amountPaid > 0 && (
                    <div className="flex items-center justify-between text-sm bg-xxm-green-50 rounded-xl px-4 py-2.5 border border-xxm-green/10">
                      <span className="text-xxm-gray-600 font-medium">Already paid</span>
                      <span className="font-bold text-xxm-green tabular-nums">{formatZAR(selectedPeriod.amountPaid)}</span>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="amount" required>Amount (ZAR)</Label>
                    <Input
                      id="amount"
                      type="number"
                      min={MIN_CONTRIBUTION_ZAR}
                      step={CONTRIBUTION_STEP_ZAR}
                      error={errors.amount?.message}
                      {...register('amount', { valueAsNumber: true })}
                    />
                    {remaining > 0 && (
                      <p className="text-xs text-xxm-gray-400 mt-1.5">
                        Remaining: <span className="font-semibold text-xxm-green-700">{formatZAR(remaining)}</span>
                      </p>
                    )}
                  </div>

                  <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
                    Pay now
                  </Button>
                </form>
              </div>
            </div>
          )}
        </>
      )}

      {/* The way through a budget the member set for themselves. Without this
          the refusal from `submitManualPayment` was a dead end on the one page
          whose whole purpose is taking a payment. */}
      {budgetGuard && (
        <BudgetGuardModal
          details={budgetGuard}
          loading={overriding}
          onChangeAmount={applyRemainingBudget}
          onProceed={(reason) => confirmOverBudget(reason ?? '')}
          onClose={() => setBudgetGuard(null)}
        />
      )}
    </div>
  )
}
