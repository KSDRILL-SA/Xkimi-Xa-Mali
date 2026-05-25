'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { CreateMandateSchema, type CreateMandateInput } from '@/lib/validation/mandate'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Alert } from '@/components/ui/Alert'
import { DebitDayPicker } from './DebitDayPicker'
import { api } from '@/lib/api'

type BankAccountOption = {
  id: string
  bankName: string
  accountNumberMasked: string
  accountType: string
}

interface Props {
  bankAccounts: BankAccountOption[]
}

export function MandateForm({ bankAccounts }: Props) {
  const router = useRouter()
  const [serverError, setServerError] = useState('')

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateMandateInput>({
    resolver: zodResolver(CreateMandateSchema),
    defaultValues: { debitDay: 1, amount: 100 },
  })

  async function onSubmit(data: CreateMandateInput) {
    setServerError('')
    try {
      await api.post('/api/v1/mandates', data)
      router.refresh()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setServerError(e.message ?? 'Failed to create mandate. Please try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {serverError && <Alert variant="error">{serverError}</Alert>}

      <div>
        <Label htmlFor="bankAccountId" required>Bank account</Label>
        <Select id="bankAccountId" error={errors.bankAccountId?.message} {...register('bankAccountId')}>
          <option value="">Select a bank account</option>
          {bankAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.bankName} — {a.accountNumberMasked} ({a.accountType})
            </option>
          ))}
        </Select>
      </div>

      <div>
        <Label required>Monthly debit day</Label>
        <p className="text-xs text-gray-400 mb-2">The day of the month we debit your account (1–28)</p>
        <Controller
          name="debitDay"
          control={control}
          render={({ field }) => (
            <DebitDayPicker
              value={field.value}
              onChange={field.onChange}
              error={errors.debitDay?.message}
            />
          )}
        />
      </div>

      <div>
        <Label htmlFor="amount" required>Monthly amount (ZAR)</Label>
        <Input
          id="amount"
          type="number"
          min={100}
          step={50}
          placeholder="e.g. 100"
          error={errors.amount?.message}
          {...register('amount', { valueAsNumber: true })}
        />
        <p className="text-xs text-gray-400 mt-1">Minimum R100 per month</p>
      </div>

      <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
        Set up mandate
      </Button>
    </form>
  )
}
