'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormGroup } from '@/components/ui/FormGroup'
import { Alert } from '@/components/ui/Alert'
import { PasswordResetSchema as Schema } from '@/lib/validation/auth'
import type { PasswordResetInput } from '@/lib/validation/auth'
import { api, ApiClientError } from '@/lib/api'

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
    try {
      await api.post('/api/v1/auth/reset-password', { ...data, token })
      router.push('/login?reset=1')
    } catch (err) {
      setServerError(err instanceof ApiClientError ? err.message : 'Reset failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <Alert variant="error">{serverError}</Alert>}
      <FormGroup label="New password" htmlFor="password" required error={errors.password?.message} hint="At least 12 characters. A short phrase you will remember works well.">
        <Input id="password" type="password" autoComplete="new-password" placeholder="At least 12 characters" icon={Lock} {...register('password')} />
      </FormGroup>
      <FormGroup label="Confirm password" htmlFor="confirmPassword" required error={errors.confirmPassword?.message}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" placeholder="Repeat your password" icon={Lock} {...register('confirmPassword')} />
      </FormGroup>
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Set new password
      </Button>
    </form>
  )
}
