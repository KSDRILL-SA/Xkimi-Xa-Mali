'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { ManualContributionSchema, type ManualContributionInput } from '@/lib/validation/contribution'
import { GoalPaymentSchema, MIN_GOAL_PAYMENT, type GoalPaymentInput } from '@/lib/validation/goal'
import { NETCASH_FEE_BUFFER, debitAmountWithFee } from '@/lib/group-account'
import { needsOverfundingConfirmation } from '@/lib/goal-funding'
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
import { Wallet, CreditCard, CheckCircle2, AlertTriangle, Target, HandCoins } from 'lucide-react'

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

type GoalOption = {
  id: string
  title: string
  targetAmount: number
  currentAmount: number
  remaining: number
  progressPct: number
  isPrimary: boolean
}

/**
 * What the member is paying for.
 *
 * The page is called "Make a Payment", but it only ever knew how to make one
 * kind. Paying a chosen goal already existed in the backend and was reachable
 * only from that goal's own page, so a member who came here to give money had
 * no way to say where it should go.
 *
 * The two are genuinely different payments, not one payment with a setting.
 * A monthly contribution settles an obligation for a period and flows to the
 * group pool, which is what funds the primary fund. A goal payment is extra
 * money aimed at one goal. Keeping them apart is what stops the same rand
 * being counted twice — the primary fund derives its total from every
 * contribution in its year, so a contribution "redirected" elsewhere would be
 * added to the fund it left and the goal it went to.
 */
type Destination = 'contribution' | 'goal'

export default function ContributePage() {
  const router = useRouter()
  const [openPeriods, setOpenPeriods] = useState<OpenPeriod[]>([])
  const [mandate, setMandate] = useState<MandateInfo | null>(null)
  // Three states, not two. A member who has just set a mandate up holds a
  // PENDING one, and telling them they have none sends them back to create a
  // second — which the one-active-or-pending rule then refuses. See below.
  const [mandateState, setMandateState] = useState<'none' | 'pending' | 'active'>('none')
  const [loading, setLoading] = useState(true)
  const [serverError, setServerError] = useState('')
  const [success, setSuccess] = useState(false)
  const [budgetGuard, setBudgetGuard] = useState<BudgetGuardDetails | null>(null)
  const [pending, setPending] = useState<ManualContributionInput | null>(null)
  const [overriding, setOverriding] = useState(false)

  const [destination, setDestination] = useState<Destination>('contribution')
  const [goals, setGoals] = useState<GoalOption[]>([])
  const [selectedGoalId, setSelectedGoalId] = useState('')
  // Set when the member asks to pay more than a goal still needs. Holding the
  // amount here rather than paying straight through lets them choose, instead
  // of the app either silently capping them or silently overfunding.
  const [overfund, setOverfund] = useState<{ amount: number; remaining: number } | null>(null)
  const [goalSuccess, setGoalSuccess] = useState<{ amount: number; title: string } | null>(null)

  // Cleared on unmount. A member who navigates away inside the redirect window
  // otherwise gets pushed to a page they had already left.
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // One token per payment the member intends, not per request.
  //
  // A double tap, a retried request and a browser back-and-resubmit all carry
  // this same value, so the server collapses them onto the first debit. A
  // second, deliberate payment happens after a fresh page load and therefore
  // carries a new one. Regenerated after a submission that reached the gateway,
  // so an immediate retry of a *refused* payment is treated as a new intent —
  // which it is: nothing was taken, and they are choosing to try again.
  const paymentToken = useRef<string>(crypto.randomUUID())
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

  // A separate form. The two payments validate differently — a contribution
  // needs a period and has its own minimum — so one resolver cannot serve both.
  const goalForm = useForm<GoalPaymentInput>({
    resolver: zodResolver(GoalPaymentSchema),
    defaultValues: { amount: MIN_GOAL_PAYMENT },
  })

  const selectedGoal = goals.find((g) => g.id === selectedGoalId) ?? null
  const goalAmount = goalForm.watch('amount')

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

        // Goals are wanted but not required. A failure to load them must not
        // take the contribution form down with it — paying the month is the
        // job this page exists for.
        const [contribs, mandates, goalPage] = await Promise.all([
          api.get<ContribItem[]>('/api/v1/contributions'),
          api.get<MandateItem[]>('/api/v1/mandates'),
          api
            .get<GoalOption[]>('/api/v1/goals?status=ACTIVE&limit=50')
            .catch(() => [] as GoalOption[]),
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

        // The primary fund first: it is the one the whole group is saving
        // toward, so it belongs at the top of a list of places to send money.
        //
        // Locked goals stay in the list. Locking freezes a goal's *definition*
        // — `updateGoal` and `deleteGoal` refuse once `lockedAt` is set — while
        // `recordProgress` and `payToGoal` ignore it entirely. A locked goal is
        // a live goal whose terms an admin has fixed, not a closed one.
        const activeGoals = (goalPage ?? []).map((g) => ({ ...g }))
        activeGoals.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        setGoals(activeGoals)
        if (activeGoals[0]) setSelectedGoalId(activeGoals[0].id)

        setOpenPeriods(open)
        if (open[0]) {
          setValue('periodMonth', open[0].periodMonth)
          setValue('periodYear', open[0].periodYear)
        }

        const active = mandates.find((m) => m.status === 'ACTIVE')
        const pending = mandates.find((m) => m.status === 'PENDING')

        if (active) {
          setMandateState('active')
          setMandate({
            bankName: active.bankAccount.bankName,
            accountNumberMasked: active.bankAccount.accountNumberMasked,
            amount: Number(active.amount),
          })
        } else if (pending) {
          setMandateState('pending')
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
    const result = await api.post<{ status?: string }>('/api/v1/contributions/pay', {
      ...data,
      idempotencyKey: paymentToken.current,
    })
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
      // Nothing was taken, so a retry is a new intent rather than a repeat.
      paymentToken.current = crypto.randomUUID()
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

  /**
   * Pay a chosen goal.
   *
   * A separate debit from the monthly contribution, and deliberately so: the
   * two settle differently and reverse differently. The token is regenerated
   * after every attempt that reached the gateway, so a member giving twice on
   * purpose is not collapsed onto their first payment.
   */
  async function payGoal(data: GoalPaymentInput, goalId: string) {
    setServerError('')
    try {
      const res = await api.post<{ amount: number; goalTitle: string; status: string }>(
        `/api/v1/goals/${goalId}/pay`,
        { ...data, idempotencyKey: paymentToken.current },
      )
      paymentToken.current = crypto.randomUUID()

      if (res.status === 'FAILED') {
        setServerError(
          'Your bank refused this payment. Nothing has been taken from your account. ' +
          'Check your available balance and try again, or contact your bank.',
        )
        return
      }
      setGoalSuccess({ amount: res.amount, title: res.goalTitle })
      router.refresh()
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        // The goal reached its target, or was locked, between this page loading
        // and the member pressing pay. A stale list is not their mistake, so
        // say what happened rather than showing a raw refusal.
        if (err.code === 'GOL_013') {
          setServerError(
            'That goal is no longer open for payments — it may have just reached its target. ' +
            'Refresh the page to see the latest goals.',
          )
          return
        }
        if (err.code === 'CTR_002') {
          setServerError('You need an active debit order before you can pay a goal.')
          return
        }
      }
      const e = err as { message?: string }
      setServerError(e.message ?? 'Payment failed. Please try again.')
    }
  }

  /**
   * Check the amount against what the goal still needs before charging it.
   *
   * `payToGoal` never compares the amount to the target, so R5 000 into a goal
   * needing R200 went through with nothing said. Capping silently would take
   * the decision away from the member — some will mean it. So they are told,
   * and they choose.
   */
  async function onGoalSubmit(data: GoalPaymentInput) {
    if (!selectedGoal) return
    if (needsOverfundingConfirmation(data.amount, selectedGoal.remaining)) {
      setOverfund({ amount: data.amount, remaining: selectedGoal.remaining })
      return
    }
    await payGoal(data, selectedGoal.id)
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
            Pay your monthly contribution, or put extra straight into a goal — both
            from your registered bank account.
          </p>
        </div>
      </Reveal>

      {/* ── No mandate error ───────────────────────── */}
      {/* A mandate awaiting the bank is not a missing mandate.
          This said "No active mandate — Set up mandate" for both, so a member
          who had just created one was sent back to create a second, which the
          one-active-or-pending rule refuses. They were told to do the thing
          they had already done and could not do again. */}
      {mandateState === 'pending' && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-amber-900">Your mandate is awaiting approval</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Your bank is still authorising the debit order you set up. Payments can be made
              once that is done — you do not need to set up another one.{' '}
              <a href="/dashboard/mandates" className="underline font-bold hover:text-amber-950 transition-colors">
                View your mandate
              </a>
            </p>
          </div>
        </div>
      )}

      {mandateState === 'none' && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-red-800">No payment mandate</p>
            <p className="text-xs text-red-700 mt-0.5">
              You need a payment mandate before making a payment.{' '}
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

          {/* ── What are you paying? ───────────────── */}
          {/* Only worth asking when there is somewhere else for the money to
              go. With no active goals this is a contribution page and the
              question would be noise. */}
          {goals.length > 0 && !success && !goalSuccess && (
            <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-5">
              <p className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest mb-3">
                What are you paying?
              </p>
              <div className="grid grid-cols-2 gap-3">
                {([
                  { key: 'contribution' as const, icon: Wallet, label: 'Monthly contribution', hint: 'Settles your period' },
                  { key: 'goal' as const, icon: Target, label: 'A specific goal', hint: 'Extra, on top' },
                ]).map(({ key, icon: Icon, label, hint }) => {
                  const on = destination === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { setDestination(key); setServerError(''); setOverfund(null) }}
                      aria-pressed={on}
                      className={`text-left rounded-2xl border p-4 transition-all duration-fast ${
                        on
                          ? 'border-xxm-green bg-xxm-green-50/60 ring-1 ring-xxm-green/30'
                          : 'border-xxm-gray-200 hover:border-xxm-green/40 hover:bg-xxm-green-50/20'
                      }`}
                    >
                      <Icon size={17} className={on ? 'text-xxm-green' : 'text-xxm-gray-400'} aria-hidden />
                      <p className={`text-sm font-bold mt-2 ${on ? 'text-xxm-green-900' : 'text-xxm-gray-600'}`}>{label}</p>
                      <p className="text-[11px] text-xxm-gray-400 mt-0.5">{hint}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Goal payment ───────────────────────── */}
          {destination === 'goal' && goals.length > 0 && (
            goalSuccess ? (
              <div className="bg-white rounded-2xl border border-xxm-green/20 shadow-xxm-sm p-8 text-center space-y-3 animate-scale-in">
                <div className="w-14 h-14 rounded-2xl bg-xxm-green-50 flex items-center justify-center mx-auto animate-scale-in">
                  <HandCoins size={28} className="text-xxm-green" aria-hidden />
                </div>
                <p className="font-display text-lg font-extrabold text-xxm-green-900">Thank you!</p>
                <p className="text-sm text-xxm-gray-500">
                  {formatZAR(goalSuccess.amount)} toward &ldquo;{goalSuccess.title}&rdquo; is in.
                </p>
                <Button variant="ghost" size="sm" onClick={() => { setGoalSuccess(null); goalForm.reset({ amount: MIN_GOAL_PAYMENT }) }}>
                  Make another payment
                </Button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-xxm-gray-100 bg-xxm-green-50/30">
                  <h2 className="text-base font-bold text-xxm-green-900">Which goal?</h2>
                </div>
                <div className="p-5">
                  {serverError && <Alert variant="error" className="mb-4">{serverError}</Alert>}

                  <form onSubmit={goalForm.handleSubmit(onGoalSubmit)} className="space-y-5" noValidate>
                    <div>
                      <Label htmlFor="goal" required>Goal</Label>
                      <Select
                        id="goal"
                        value={selectedGoalId}
                        onChange={(e) => { setSelectedGoalId(e.target.value); setOverfund(null) }}
                      >
                        {goals.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.title}{g.isPrimary ? ' — our fund' : ''}
                          </option>
                        ))}
                      </Select>
                    </div>

                    {selectedGoal && (
                      <div className="rounded-xl bg-xxm-green-50/60 border border-xxm-green/10 px-4 py-3 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-xxm-gray-500">Raised so far</span>
                          <span className="font-bold text-xxm-green-900 tabular-nums">
                            {formatZAR(selectedGoal.currentAmount)} of {formatZAR(selectedGoal.targetAmount)}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-xxm-green-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-xxm-green transition-all"
                            style={{ width: `${selectedGoal.progressPct}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-xxm-gray-500">
                          {selectedGoal.remaining > 0
                            ? <>{formatZAR(selectedGoal.remaining)} still needed to reach this goal.</>
                            : <>This goal has reached its target — anything more is a bonus.</>}
                        </p>
                      </div>
                    )}

                    <div>
                      <Label htmlFor="goal-amount" required>Amount (ZAR)</Label>
                      <Input
                        id="goal-amount"
                        type="number"
                        min={MIN_GOAL_PAYMENT}
                        step={10}
                        error={goalForm.formState.errors.amount?.message}
                        {...goalForm.register('amount', { valueAsNumber: true })}
                      />
                    </div>

                    {/* The member is about to be charged twice over if they also
                        pay their month, and each debit carries its own fee. Say
                        so before the money moves, not after. */}
                    {NETCASH_FEE_BUFFER > 0 && (
                      <div className="rounded-xl border border-xxm-gray-100 bg-xxm-gray-50/70 px-4 py-3 space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-xxm-gray-500">Toward the goal</span>
                          <span className="font-semibold text-xxm-green-900">{formatZAR(goalAmount || 0)}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-xxm-gray-500">Netcash processing fee</span>
                          <span className="font-semibold text-amber-700">+{formatZAR(NETCASH_FEE_BUFFER)}</span>
                        </div>
                        <div className="flex justify-between text-sm pt-1.5 border-t border-xxm-gray-200">
                          <span className="font-semibold text-xxm-green-900">Total debited</span>
                          <span className="font-bold text-xxm-green-900">{formatZAR(debitAmountWithFee(goalAmount || 0))}</span>
                        </div>
                        <p className="text-[10px] text-xxm-gray-400 pt-0.5">
                          A separate debit from your monthly contribution, with its own fee.
                        </p>
                      </div>
                    )}

                    {overfund ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-3">
                        <p className="text-sm font-semibold text-amber-900">
                          That is more than this goal needs
                        </p>
                        <p className="text-xs text-amber-800">
                          You entered {formatZAR(overfund.amount)}, and{' '}
                          {selectedGoal ? `“${selectedGoal.title}”` : 'this goal'} only needs{' '}
                          {formatZAR(overfund.remaining)} more. The extra still goes to the goal.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              goalForm.setValue('amount', overfund.remaining, { shouldValidate: true })
                              setOverfund(null)
                            }}
                          >
                            Pay {formatZAR(overfund.remaining)} instead
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            loading={goalForm.formState.isSubmitting}
                            onClick={async () => {
                              const amount = overfund.amount
                              setOverfund(null)
                              if (selectedGoal) await payGoal({ amount }, selectedGoal.id)
                            }}
                          >
                            Pay {formatZAR(overfund.amount)} anyway
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="submit"
                        size="lg"
                        className="w-full"
                        loading={goalForm.formState.isSubmitting}
                        disabled={!selectedGoal}
                      >
                        Pay {formatZAR(debitAmountWithFee(goalAmount || 0))} now
                      </Button>
                    )}
                  </form>
                </div>
              </div>
            )
          )}

          {/* ── Success state ──────────────────────── */}
          {destination === 'contribution' && (success ? (
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
          ))}
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
