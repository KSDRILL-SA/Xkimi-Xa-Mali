'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Alert } from '@/components/ui/Alert'

const Schema = z.object({ email: z.string().email('Please enter a valid email address') })
type FormData = z.infer<typeof Schema>

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
      await fetch('/api/v1/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
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
      <div>
        <Label htmlFor="email" required>Email address</Label>
        <Input id="email" type="email" placeholder="you@example.com" error={errors.email?.message} {...register('email')} />
      </div>
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
