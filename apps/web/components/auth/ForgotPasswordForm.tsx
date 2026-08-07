'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormGroup } from '@/components/ui/FormGroup'
import { Alert } from '@/components/ui/Alert'

import { PasswordResetRequestSchema as Schema } from '@/lib/validation/auth'
import type { PasswordResetRequestInput as FormData } from '@/lib/validation/auth'
import { api, ApiClientError } from '@/lib/api'

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(Schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    setError('')
    try {
      await api.post('/api/v1/auth/forgot-password', data)
      setSent(true)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <Alert variant="success">
        If that email is registered, a reset link is on its way. Check your inbox.
      </Alert>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {error && <Alert variant="error">{error}</Alert>}
      <FormGroup label="Email address" htmlFor="email" required error={errors.email?.message}>
        <Input id="email" type="email" placeholder="you@example.com" icon={Mail} {...register('email')} />
      </FormGroup>
      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Send reset link
      </Button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-xxm-green font-medium hover:underline">
          Back to login
        </Link>
      </p>
    </form>
  )
}
