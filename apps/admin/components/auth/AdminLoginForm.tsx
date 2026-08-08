'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button, Input, Label, Alert } from '@xxm/ui'
import { Eye, EyeOff, Mail, Lock } from 'lucide-react'

export function AdminLoginForm() {
  const router      = useRouter()
  const params      = useSearchParams()
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [showPw,  setShowPw]  = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const fd       = new FormData(e.currentTarget)
    const email    = fd.get('email')    as string
    const password = fd.get('password') as string

    const result = await signIn('credentials', {
      email, password, redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError(
        // Throttled, not rejected — the password was never checked, so the
        // generic "invalid credentials" would be actively misleading here.
        result.error === 'RATE_LIMITED'
          ? 'Too many sign-in attempts from this connection. Please wait five minutes and try again.'
          : result.error === 'ACCOUNT_SUSPENDED'
          ? 'This account has been suspended. Contact another administrator.'
          : result.error === 'ACCOUNT_LOCKED'
          ? 'This account is locked due to too many failed login attempts. Contact another administrator.'
          : result.error === 'ACCOUNT_PENDING'
          ? 'This account has not been fully activated. Contact another administrator.'
          : 'Invalid credentials or insufficient permissions.',
      )
      return
    }

    const callbackUrl = params.get('callbackUrl') ?? '/'
    router.push(callbackUrl)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="relative bg-white rounded-2xl shadow-xxm-lg ring-1 ring-black/5 p-6 space-y-4">
      <div className="absolute -top-px left-6 right-6 h-px bg-gold-shimmer opacity-70" aria-hidden />
      {error && <Alert variant="error">{error}</Alert>}

      <div className="space-y-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required
          icon={Mail} placeholder="admin@example.com" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password" name="password" type={showPw ? 'text' : 'password'}
          autoComplete="current-password" required
          icon={Lock}
          suffix={
            <button type="button" onClick={() => setShowPw((v) => !v)} className="text-xxm-gray-400 hover:text-xxm-green transition-colors" aria-label={showPw ? 'Hide password' : 'Show password'}>
              {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          }
        />
      </div>

      <Button type="submit" fullWidth loading={loading} className="mt-2">
        Sign in to Admin
      </Button>
    </form>
  )
}
