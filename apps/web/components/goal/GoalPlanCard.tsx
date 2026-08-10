'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CalendarClock, Repeat, Pause, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Alert } from '@/components/ui/Alert'
import { formatZAR } from '@/lib/formatters'
import { api, ApiClientError } from '@/lib/api'
import { NETCASH_FEE_BUFFER, debitAmountWithFee } from '@/lib/group-account'

type Suggestion = {
  goalTitle: string
  remaining: number
  months: number
  suggested: number
  alreadyEnrolled: boolean
  committedMonthly: number
}

type Plan = {
  id: string
  goalId: string
  amount: number
  debitDay: number
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'CANCELLED'
  endedReason: string | null
}

interface Props {
  goalId: string
  hasActiveMandate: boolean
}

/**
 * Commit to funding one goal every month.
 *
 * The one-off card beside this collects money now; this sets a standing
 * instruction. A member who would rather commit than remember picks an amount
 * and a day, and the collection job charges the debit order they already hold.
 *
 * The amount is suggested from what the goal still needs over the months it has
 * left — the shape the member asked for — and then left to them. Someone who
 * can only afford less should be able to join at less rather than be shut out
 * of the goal entirely.
 *
 * Days run 1–28 only. A plan set to the 29th, 30th or 31st is clamped to the
 * end of a short month by the collection job, which is correct but not
 * something to make a member reason about when choosing.
 */
export function GoalPlanCard({ goalId, hasActiveMandate }: Props) {
  const router = useRouter()
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [amount, setAmount] = useState<number>(0)
  const [debitDay, setDebitDay] = useState(25)

  useEffect(() => {
    async function load() {
      try {
        const [s, plans] = await Promise.all([
          api.get<Suggestion>(`/api/v1/goal-plans?goalId=${goalId}`),
          api.get<Plan[]>('/api/v1/goal-plans'),
        ])
        setSuggestion(s)
        setAmount(s.suggested)
        // Only a plan that is still running matters here. A cancelled one is
        // history, and showing it would suggest the member is committed when
        // they are not.
        setPlan(plans.find((p) => p.goalId === goalId && (p.status === 'ACTIVE' || p.status === 'PAUSED')) ?? null)
      } catch {
        setError('Could not load plan details.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [goalId])

  async function act<T>(fn: () => Promise<T>) {
    setBusy(true)
    setError('')
    try {
      await fn()
      router.refresh()
      const plans = await api.get<Plan[]>('/api/v1/goal-plans')
      setPlan(plans.find((p) => p.goalId === goalId && (p.status === 'ACTIVE' || p.status === 'PAUSED')) ?? null)
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.code === 'CTR_002') {
        setError('You need an active debit order before you can set up a plan.')
      } else {
        setError((err as { message?: string }).message ?? 'Something went wrong. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  // A placeholder rather than nothing. Returning null left a hole that filled
  // in after hydration, shoving the cards below it down the page — and on the
  // server-rendered HTML the card simply was not there at all.
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-5" aria-hidden>
        <div className="flex items-start gap-3 animate-pulse">
          <div className="w-10 h-10 rounded-xl bg-xxm-gray-100 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-48 rounded bg-xxm-gray-100" />
            <div className="h-2.5 w-full rounded bg-xxm-gray-100" />
            <div className="h-2.5 w-2/3 rounded bg-xxm-gray-100" />
          </div>
        </div>
      </div>
    )
  }

  // Without a debit order there is nothing to collect from, so this sends them
  // to set one up rather than opening a form that fails on submit.
  if (!hasActiveMandate) {
    return (
      <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-xxm-green-50 flex items-center justify-center shrink-0">
            <Repeat size={18} className="text-xxm-green" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-bold text-xxm-green-900">Fund this goal every month</p>
            <p className="text-xs text-xxm-gray-500 mt-1 leading-relaxed">
              Monthly plans are collected through your debit order. Set one up and you can
              commit to this goal instead of remembering to pay.
            </p>
            <Link href="/dashboard/mandates" className="mt-3 inline-block text-xs font-bold text-xxm-green underline">
              Set up your debit order
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Already committed ──────────────────────────────────────────────
  if (plan) {
    const paused = plan.status === 'PAUSED'
    return (
      <div className={`rounded-2xl border p-5 ${paused ? 'bg-amber-50 border-amber-200' : 'bg-white border-xxm-green/8 shadow-xxm-sm'}`}>
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${paused ? 'bg-amber-100' : 'bg-xxm-green-50'}`}>
            {paused
              ? <Pause size={18} className="text-amber-600" aria-hidden />
              : <CalendarClock size={18} className="text-xxm-green" aria-hidden />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-bold ${paused ? 'text-amber-900' : 'text-xxm-green-900'}`}>
              {paused ? 'Your monthly plan is paused' : 'You fund this goal every month'}
            </p>
            <p className={`text-xs mt-1 ${paused ? 'text-amber-800' : 'text-xxm-gray-500'}`}>
              {formatZAR(plan.amount)} on day {plan.debitDay} of each month.
              {paused && plan.endedReason ? ` ${plan.endedReason}.` : ''}
            </p>

            {error && <Alert variant="error" className="mt-3">{error}</Alert>}

            <div className="flex flex-wrap gap-2 mt-3">
              {paused && (
                <Button size="sm" loading={busy}
                  onClick={() => act(() => api.patch(`/api/v1/goal-plans/${plan.id}`, { action: 'resume' }))}>
                  Resume it
                </Button>
              )}
              <Button size="sm" variant="ghost" loading={busy}
                onClick={() => act(() => api.delete(`/api/v1/goal-plans/${plan.id}`))}>
                <X size={13} aria-hidden /> Stop this plan
              </Button>
            </div>
            <p className="text-[10px] text-xxm-gray-400 mt-2">
              Stopping a plan does not take back what it has already paid in.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ── Not yet committed ──────────────────────────────────────────────
  const total = (suggestion?.committedMonthly ?? 0) + (amount || 0)

  return (
    <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-xxm-green-50 flex items-center justify-center shrink-0">
          <Repeat size={18} className="text-xxm-green" aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-xxm-green-900">Fund this goal every month</p>
          <p className="text-xs text-xxm-gray-500 mt-1 leading-relaxed">
            Commit an amount and a day, and it is collected through your debit order until
            the goal is reached.
          </p>

          {error && <Alert variant="error" className="mt-3">{error}</Alert>}

          <div className="grid grid-cols-2 gap-3 mt-4">
            <div>
              <Label htmlFor="plan-amount" required>Monthly amount</Label>
              <Input id="plan-amount" type="number" min={10} step={10} value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))} />
              {suggestion && suggestion.remaining > 0 && (
                <p className="text-[10px] text-xxm-gray-400 mt-1.5">
                  {formatZAR(suggestion.suggested)} suggested — {formatZAR(suggestion.remaining)} over{' '}
                  {suggestion.months} month{suggestion.months === 1 ? '' : 's'}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="plan-day" required>Collected on</Label>
              <Select id="plan-day" value={String(debitDay)} onChange={(e) => setDebitDay(Number(e.target.value))}>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>Day {d}</option>
                ))}
              </Select>
              <p className="text-[10px] text-xxm-gray-400 mt-1.5">of each month</p>
            </div>
          </div>

          {/* What this actually costs, before it starts. Several plans plus the
              monthly contribution is several debits, each carrying its own fee. */}
          <div className="rounded-xl border border-xxm-gray-100 bg-xxm-gray-50/70 px-4 py-3 mt-4 space-y-1.5">
            {(suggestion?.committedMonthly ?? 0) > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-xxm-gray-500">Already committed each month</span>
                <span className="font-semibold text-xxm-green-900">{formatZAR(suggestion!.committedMonthly)}</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-xxm-gray-500">This plan</span>
              <span className="font-semibold text-xxm-green-900">{formatZAR(amount || 0)}</span>
            </div>
            <div className="flex justify-between text-sm pt-1.5 border-t border-xxm-gray-200">
              <span className="font-semibold text-xxm-green-900">Total each month</span>
              <span className="font-bold text-xxm-green-900">{formatZAR(total)}</span>
            </div>
            {NETCASH_FEE_BUFFER > 0 && (
              <p className="text-[10px] text-xxm-gray-400 pt-0.5">
                Collected separately from your monthly contribution — {formatZAR(debitAmountWithFee(amount || 0))}{' '}
                including the {formatZAR(NETCASH_FEE_BUFFER)} Netcash fee.
              </p>
            )}
          </div>

          <Button className="w-full mt-4" size="lg" loading={busy} disabled={!amount || amount < 10}
            onClick={() => act(() => api.post('/api/v1/goal-plans', { goalId, amount, debitDay }))}>
            Start this plan
          </Button>
          <p className="text-[10px] text-xxm-gray-400 mt-2 text-center">
            Stops on its own once the goal is reached. You can cancel any time.
          </p>
        </div>
      </div>
    </div>
  )
}
