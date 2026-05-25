'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { PasswordResetSchema } from '@/lib/validation/auth'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Alert } from '@/components/ui/Alert'

const Schema = PasswordResetSchema.omit({ token: true })
type FormData = z.infer<typeof Schema>

interface Props { token: string }

export function ResetPasswordForm({ token }: Props) {
  const router = useRouter()
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(Schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    setServerError('')

    const res = await fetch('/api/v1/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, token }),
    })

    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      setServerError(json.error?.message ?? 'Reset failed. Please try again.')
      return
    }

    router.push('/auth/login?reset=1')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <Alert variant="error">{serverError}</Alert>}
      <div>
        <Label htmlFor="password" required>New password</Label>
        <Input id="password" type="password" autoComplete="new-password" placeholder="Min. 8 chars, 1 uppercase, 1 number" error={errors.password?.message} {...register('password')} />
      </div>
      <div>
        <Label htmlFor="confirmPassword" required>Confirm password</Label>
        <Input id="confirmPassword" type="password" autoComplete="new-password" placeholder="Repeat your password" error={errors.confirmPassword?.message} {...register('confirmPassword')} />
      </div>
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Set new password
      </Button>
    </form>
  )
}
