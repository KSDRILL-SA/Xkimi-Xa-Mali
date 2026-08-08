'use client'

import { useState } from 'react'
import type { Route } from 'next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Mail, Lock } from 'lucide-react'
import { LoginSchema, type LoginInput } from '@/lib/validation/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormGroup } from '@/components/ui/FormGroup'
import { Alert } from '@/components/ui/Alert'

const ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_LOCKED: "Your account has been temporarily locked due to too many failed attempts. Please try again later or contact the admin.",
  EMAIL_NOT_VERIFIED: "Please verify your email before logging in.",
  PENDING_ACTIVATION: "Your account is pending admin approval. You’ll receive an SMS when it’s activated.",
  ACCOUNT_SUSPENDED: "Your account has been suspended. Contact the admin.",
  CredentialsSignin: "Incorrect email or password.",
  // Distinct from CredentialsSignin on purpose: the password was never checked,
  // so "incorrect email or password" would send someone to the reset flow for a
  // problem that clears itself in a few minutes.
  RATE_LIMITED: "Too many sign-in attempts from this connection. Please wait five minutes and try again.",
  // Their password was correct. The message has to say so, or it reads as a
  // rejection and they go looking for the wrong problem — and it has to name
  // the way out, which is the reset link directly below this alert.
  PASSWORD_RESET_REQUIRED:
    "Your password was correct, but it is shorter than our current minimum. Please use “Forgot password?” below to set a new one of at least 12 characters.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
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
  const reset = params.get('reset')
  const reason = params.get('reason')
  const errorParam = params.get('error')

  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)

  // The sign-in page is where somebody who never got their verification email
  // ends up, so the way out has to be here. Shown only once EMAIL_NOT_VERIFIED
  // comes back, which means the password was right — offering it to everyone
  // would hand a guesser a way to post mail to an address they named.
  const [needsVerification, setNeedsVerification] = useState(false)
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [lastEmail, setLastEmail] = useState('')

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
      setNeedsVerification(res.error === 'EMAIL_NOT_VERIFIED')
      setLastEmail(data.email)
      setResendState('idle')
      return
    }

    router.push(callbackUrl as Route<string>)
    router.refresh()
  }

  async function resendVerification() {
    setResendState('sending')
    try {
      await fetch('/api/v1/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: lastEmail }),
      })
    } catch {
      // The endpoint answers the same way whatever happens on the server, so
      // there is nothing here worth reporting differently. A network failure
      // and a rate limit both mean "try again shortly".
    }
    setResendState('sent')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {verified && (
        <Alert variant="success">Email verified! You can now log in.</Alert>
      )}
      {reset && (
        <Alert variant="success">Password reset successful. You can now log in with your new password.</Alert>
      )}
      {reason === 'session_expired' && !serverError && !errorParam && (
        <Alert variant="warning">Your session has expired. Please sign in again to continue.</Alert>
      )}
      {(serverError || errorParam) && (
        <Alert variant="error">
          {serverError || ERROR_MESSAGES[errorParam ?? ''] || 'An error occurred.'}
        </Alert>
      )}
      {needsVerification && (
        resendState === 'sent' ? (
          <Alert variant="success">
            If that account is waiting to be verified, a new link is on its way. It expires in 24 hours.
          </Alert>
        ) : (
          <Alert variant="warning">
            <span>Didn’t get the email, or has the link expired?</span>{' '}
            <button
              type="button"
              onClick={resendVerification}
              disabled={resendState === 'sending'}
              className="font-semibold underline underline-offset-2 disabled:opacity-60"
            >
              {resendState === 'sending' ? 'Sending…' : 'Resend verification email'}
            </button>
          </Alert>
        )
      )}

      <FormGroup label="Email address" htmlFor="email" required error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          icon={Mail}
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
          icon={Lock}
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
