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
import { FormGroup } from '@/components/ui/FormGroup'
import { Alert } from '@/components/ui/Alert'

const ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_LOCKED: 'Your account has been temporarily locked due to too many failed attempts. Please try again later or contact the admin.',
  EMAIL_NOT_VERIFIED: 'Please verify your email before logging in.',
  PENDING_ACTIVATION: 'Your account is pending admin approval. You’ll receive an SMS when it’s activated.',
  ACCOUNT_SUSPENDED: 'Your account has been suspended. Contact the admin.',
  CredentialsSignin: 'Incorrect email or password.',
}

function safeCallbackUrl(raw: string | null): string {
  if (!raw) return '/dashboard'
  try {
    const url = new URL(raw, window.location.origin)
    if (url.origin !== window.location.origin) return '/dashboard'
    return url.pathname + url.search + url.hash
  } catch {
    return '/dashboard'
  }
}

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const callbackUrl = safeCallbackUrl(params.get('callbackUrl'))
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

    router.push(callbackUrl as Route<string>)
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

      <FormGroup label="Email address" htmlFor="email" required error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          {...register('email')}
        />
      </FormGroup>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium text-xxm-green-900">
            Password <span className="text-red-500 text-xs" aria-hidden>*</span>
          </label>
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
