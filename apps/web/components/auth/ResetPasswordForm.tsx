'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormGroup } from '@/components/ui/FormGroup'
import { Alert } from '@/components/ui/Alert'
import { PasswordResetSchema as Schema } from '@/lib/validation/auth'
import type { PasswordResetInput } from '@/lib/validation/auth'

type FormData = Omit<PasswordResetInput, 'token'>

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

    const res = await fetch('/api/v1/reset-password', {
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

    router.push('/login?reset=1')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <Alert variant="error">{serverError}</Alert>}
      <FormGroup label="New password" htmlFor="password" required error={errors.password?.message} hint="Min. 8 characters, 1 uppercase, 1 number">
        <Input id="password" type="password" autoComplete="new-password" placeholder="Min. 8 chars, 1 uppercase, 1 number" {...register('password')} />
      </FormGroup>
      <FormGroup label="Confirm password" htmlFor="confirmPassword" required error={errors.confirmPassword?.message}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" placeholder="Repeat your password" {...register('confirmPassword')} />
      </FormGroup>
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Set new password
      </Button>
    </form>
  )
}
