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
        result.error === 'ACCOUNT_SUSPENDED'
          ? 'This account has been suspended.'
          : 'Invalid credentials or insufficient permissions.',
      )
      return
    }

    const callbackUrl = params.get('callbackUrl') ?? '/'
    router.push(callbackUrl)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xxm-lg p-6 space-y-4">
      {error && <Alert variant="error">{error}</Alert>}

      <div className="space-y-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required
          icon={<Mail size={15} />} placeholder="admin@example.com" />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password" name="password" type={showPw ? 'text' : 'password'}
          autoComplete="current-password" required
          icon={<Lock size={15} />}
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
