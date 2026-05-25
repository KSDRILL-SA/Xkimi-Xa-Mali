'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { DelayMandateSchema, type DelayMandateInput } from '@/lib/validation/mandate'
import { Button } from '@/components/ui/Button'
import { Label } from '@/components/ui/Label'
import { Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { api } from '@/lib/api'

interface Props {
  mandateId: string
  onClose: () => void
}

export function DelayForm({ mandateId, onClose }: Props) {
  const router = useRouter()
  const [serverError, setServerError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DelayMandateInput>({
    resolver: zodResolver(DelayMandateSchema),
  })

  async function onSubmit(data: DelayMandateInput) {
    setServerError('')
    try {
      await api.post(`/api/v1/mandates/${mandateId}/delay`, data)
      router.refresh()
      onClose()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setServerError(e.message ?? 'Failed to delay debit. Please try again.')
    }
  }

  // Build from local calendar parts, not toISOString — in SAST (UTC+2) a
  // local-midnight toISOString rolls back a day, making "tomorrow" show as today.
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <Alert variant="error">{serverError}</Alert>}

      <div>
        <Label htmlFor="newDate" required>New debit date</Label>
        <Input
          id="newDate"
          type="date"
          min={minDate}
          error={errors.newDate?.message}
          {...register('newDate')}
        />
      </div>

      <div>
        <Label htmlFor="reason">Reason (optional)</Label>
        <Input
          id="reason"
          type="text"
          placeholder="e.g. Cash flow timing"
          maxLength={200}
          error={errors.reason?.message}
          {...register('reason')}
        />
      </div>

      <div className="flex gap-3 pt-1">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" loading={isSubmitting}>
          Confirm delay
        </Button>
      </div>
    </form>
  )
}
