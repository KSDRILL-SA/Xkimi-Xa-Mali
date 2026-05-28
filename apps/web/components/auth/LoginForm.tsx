'use client'

import { useState } from 'react'
import type { Route } from 'next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { LoginSchema, type LoginInput } from '@/lib/validation/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Alert } from '@/components/ui/Alert'

const ERROR_MESSAGES: Record<string, string> = {
  EMAIL_NOT_VERIFIED: 'Please verify your email before logging in.',
  ACCOUNT_SUSPENDED: 'Your account has been suspended. Contact the admin.',
  CredentialsSignin: 'Incorrect email or password.',
}

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const callbackUrl = params.get('callbackUrl') ?? '/dashboard'
  const verified = params.get('verified')
  const errorParam = params.get('error')

  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
  })

  async function onSubmit(data: LoginInput) {
    setLoading(true)
    setServerError('')

    const res = await signIn('credentials', {
      email: data.email,
      password: data.password,
      redirect: false,
    })

    setLoading(false)

    if (res?.error) {
      setServerError(ERROR_MESSAGES[res.error] ?? 'Something went wrong. Please try again.')
      return
    }

    router.push(callbackUrl as Route)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {verified && (
        <Alert variant="success">Email verified! You can now log in.</Alert>
      )}
      {(serverError || errorParam) && (
        <Alert variant="error">
          {serverError || ERROR_MESSAGES[errorParam ?? ''] || 'An error occurred.'}
        </Alert>
      )}

      <div>
        <Label htmlFor="email" required>Email address</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label htmlFor="password" required>Password</Label>
          <Link href="/forgot-password" className="text-xs text-xxm-green hover:underline">
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          error={errors.password?.message}
          {...register('password')}
        />
      </div>

      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Sign in
      </Button>

      <p className="text-center text-sm text-gray-600">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="font-medium text-xxm-green hover:underline">
          Register
        </Link>
      </p>
    </form>
  )
}
