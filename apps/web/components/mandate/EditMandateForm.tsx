'use client'

import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { UpdateMandateSchema, type UpdateMandateInput } from '@/lib/validation/mandate'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { DebitDayPicker } from './DebitDayPicker'
import { api } from '@/lib/api'
import { MIN_CONTRIBUTION_ZAR, MAX_CONTRIBUTION_ZAR, CONTRIBUTION_STEP_ZAR } from '@/lib/formatters'

interface Props {
  mandateId: string
  currentDebitDay: number
  currentAmount: number
  onClose: () => void
}

export function EditMandateForm({ mandateId, currentDebitDay, currentAmount, onClose }: Props) {
  const router = useRouter()
  const [serverError, setServerError] = useState('')

  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateMandateInput>({
    resolver: zodResolver(UpdateMandateSchema),
    defaultValues: { debitDay: currentDebitDay, amount: currentAmount },
  })

  async function onSubmit(data: UpdateMandateInput) {
    setServerError('')
    try {
      await api.patch(`/api/v1/mandates/${mandateId}`, data)
      router.refresh()
      onClose()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setServerError(e.message ?? 'Failed to update mandate. Please try again.')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {serverError && <Alert variant="error">{serverError}</Alert>}

      <div>
        <Label required>Monthly debit day</Label>
        <p className="text-xs text-gray-400 mb-2">
          Changes take effect from the next debit cycle
        </p>
        <Controller
          name="debitDay"
          control={control}
          render={({ field }) => (
            <DebitDayPicker
              value={field.value ?? currentDebitDay}
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
          min={MIN_CONTRIBUTION_ZAR}
          max={MAX_CONTRIBUTION_ZAR}
          step={CONTRIBUTION_STEP_ZAR}
          error={errors.amount?.message}
          {...register('amount', { valueAsNumber: true })}
        />
        <p className="text-xs text-gray-400 mt-1">R{MIN_CONTRIBUTION_ZAR} – R{MAX_CONTRIBUTION_ZAR.toLocaleString()}</p>
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" loading={isSubmitting}>
          Save changes
        </Button>
      </div>
    </form>
  )
}
