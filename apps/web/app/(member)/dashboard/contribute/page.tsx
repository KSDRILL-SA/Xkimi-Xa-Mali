'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { ManualContributionSchema, type ManualContributionInput } from '@/lib/validation/contribution'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Alert } from '@/components/ui/Alert'
import { api } from '@/lib/api'
import { formatZAR, formatMonth, MIN_CONTRIBUTION_ZAR, CONTRIBUTION_STEP_ZAR } from '@/lib/formatters'

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

// Fetch data client-side — this page uses the API directly for simpler rendering
export default function ContributePage() {
  const router = useRouter()
  const [openPeriods, setOpenPeriods] = useState<OpenPeriod[]>([])
  const [mandate, setMandate] = useState<MandateInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [serverError, setServerError] = useState('')
  const [success, setSuccess] = useState(false)

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
    : mandate?.amount ?? 100

  // Pre-fill amount when period changes
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

        // Add current month if not in list
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

  async function onSubmit(data: ManualContributionInput) {
    setServerError('')
    try {
      await api.post('/api/v1/contributions/pay', data)
      setSuccess(true)
      setTimeout(() => router.push('/dashboard/contributions'), 1500)
    } catch (err: unknown) {
      const e = err as { message?: string }
      setServerError(e.message ?? 'Payment failed. Please try again.')
    }
  }

  if (loading) {
    return (
      <div className="max-w-lg space-y-4">
        <div className="h-8 skeleton w-48 rounded" />
        <div className="xxm-card p-6 space-y-4">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 skeleton rounded" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-xxm-green-900">Make a payment</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pay a once-off contribution from your registered bank account.
        </p>
      </div>

      {!mandate && (
        <div className="xxm-card p-5 xxm-banner-error">
          <p className="text-sm font-semibold">No active mandate</p>
          <p className="text-xs mt-1">
            You need an active payment mandate before making a payment.
            <a href="/dashboard/mandates" className="ml-1 underline font-semibold">Set up mandate</a>
          </p>
        </div>
      )}

      {mandate && (
        <>
          {/* Debit account banner */}
          <div className="xxm-card p-4 flex items-center gap-4 border-l-4 border-xxm-green">
            <div className="flex-1">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Debit account
              </p>
              <p className="text-sm font-semibold text-xxm-green-900">{mandate.bankName}</p>
              <p className="text-xs text-gray-400 font-mono tracking-wider">
                {mandate.accountNumberMasked}
              </p>
            </div>
          </div>

          {success ? (
            <div className="xxm-card p-6 text-center space-y-2">
              <p className="text-lg font-bold xxm-text-success">Payment submitted</p>
              <p className="text-sm text-gray-500">Redirecting to your contributions...</p>
            </div>
          ) : (
            <div className="xxm-card p-6">
              {serverError && <Alert variant="error" className="mb-4">{serverError}</Alert>}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
                <div>
                  <Label htmlFor="period" required>Period</Label>
                  {/* A single combined key encodes both month+year so changing period always updates both */}
                  <Select
                    id="period"
                    value={`${watch('periodYear')}-${watch('periodMonth')}`}
                    onChange={(e) => {
                      const [y, m] = e.target.value.split('-').map(Number)
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
                  <div className="text-sm flex justify-between text-gray-500">
                    <span>Already paid</span>
                    <span className="xxm-text-success font-medium">
                      {formatZAR(selectedPeriod.amountPaid)}
                    </span>
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
                    <p className="text-xs text-gray-400 mt-1">
                      Remaining: <span className="font-medium">{formatZAR(remaining)}</span>
                    </p>
                  )}
                </div>

                <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
                  Pay now
                </Button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  )
}
