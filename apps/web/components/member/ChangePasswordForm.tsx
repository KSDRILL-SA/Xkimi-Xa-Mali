'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ChangePasswordSchema } from '@/lib/validation/auth'
import { z } from 'zod'
import { api, ApiClientError } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Alert } from '@/components/ui/Alert'

type FormData = z.infer<typeof ChangePasswordSchema>

export function ChangePasswordForm() {
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(ChangePasswordSchema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    setStatus(null)
    try {
      await api.patch('/api/v1/auth/change-password', data)
      setStatus({ type: 'success', msg: 'Password changed successfully.' })
      reset()
    } catch (err) {
      setStatus({ type: 'error', msg: err instanceof ApiClientError ? err.message : 'Failed to change password' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-md" noValidate>
      {status && <Alert variant={status.type}>{status.msg}</Alert>}
      <div>
        <Label htmlFor="currentPassword" required>Current password</Label>
        <Input id="currentPassword" type="password" autoComplete="current-password" error={errors.currentPassword?.message} {...register('currentPassword')} />
      </div>
      <div>
        <Label htmlFor="newPassword" required>New password</Label>
        <Input id="newPassword" type="password" autoComplete="new-password" placeholder="Min. 8 chars, 1 uppercase, 1 number" error={errors.newPassword?.message} {...register('newPassword')} />
      </div>
      <div>
        <Label htmlFor="confirmPassword" required>Confirm new password</Label>
        <Input id="confirmPassword" type="password" autoComplete="new-password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" loading={loading}>Change password</Button>
      </div>
    </form>
  )
}
