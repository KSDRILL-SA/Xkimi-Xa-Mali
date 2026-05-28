'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Alert } from '@/components/ui/Alert'

type PrefilledData = {
  firstName: string
  lastName: string
  email: string
  phone: string
  minimumAmount: number
}

export function RegisterForm() {
  const router      = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep]         = useState<1 | 2>(1)
  const [inviteCode, setInviteCode] = useState('')
  const [prefilled, setPrefilled]   = useState<PrefilledData | null>(null)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)

  // Auto-validate when code arrives via email/SMS link (?code=XKM-...)
  useEffect(() => {
    const urlCode = searchParams.get('code')
    if (!urlCode) return
    const formatted = urlCode.trim().toUpperCase()
    setInviteCode(formatted)
    setLoading(true)
    fetch('/api/v1/auth/invitations/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: formatted }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.data) {
          setPrefilled(json.data)
          setStep(2)
        } else {
          setError(json.error?.message ?? 'This invite link is invalid or has expired.')
        }
      })
      .catch(() => setError('Could not validate invite code. Please try again.'))
      .finally(() => setLoading(false))
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Step 1 — validate invite code ─────────────────────────────────────────

  async function handleValidateCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/v1/auth/invitations/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: inviteCode.trim().toUpperCase() }),
    })

    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(json.error?.message ?? 'Invalid invite code. Please check and try again.')
      return
    }

    setPrefilled(json.data)
    setStep(2)
  }

  // ─── Step 2 — complete registration ────────────────────────────────────────

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const fd = new FormData(e.currentTarget)
    const payload = {
      inviteCode:     inviteCode.trim().toUpperCase(),
      email:          prefilled!.email,
      phone:          prefilled!.phone,
      firstName:      (fd.get('firstName') as string).trim(),
      lastName:       (fd.get('lastName') as string).trim(),
      idNumber:       (fd.get('idNumber') as string || undefined),
      password:       fd.get('password') as string,
      consentToPopia: true,
    }

    const res = await fetch('/api/v1/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(json.error?.message ?? 'Registration failed. Please try again.')
      return
    }

    setSuccess(true)
  }

  // ─── Success screen ─────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <div className="w-16 h-16 rounded-full bg-xxm-green-100 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-xxm-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-xxm-green-900">Check your email</h2>
        <p className="text-gray-600 text-sm">
          We sent a verification link to <strong>{prefilled?.email}</strong>. Click the link to activate your account.
        </p>
        <Button variant="ghost" size="sm" onClick={() => router.push('/login')}>
          Back to login
        </Button>
      </div>
    )
  }

  // ─── Step 1 — Enter invite code ─────────────────────────────────────────────

  if (step === 1) {
    return (
      <form onSubmit={handleValidateCode} className="space-y-4" noValidate>
        {error && <Alert variant="error">{error}</Alert>}

        <div>
          <Label htmlFor="inviteCode" required>Invite code</Label>
          <Input
            id="inviteCode"
            placeholder="XKM-XXXX-XXXX"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            maxLength={12}
            className="font-mono tracking-widest text-center"
          />
          <p className="text-xs text-gray-400 mt-1">
            Enter the invite code you received via SMS or email.
          </p>
        </div>

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Validate code
        </Button>

        <p className="text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/login" className="font-medium text-xxm-green hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    )
  }

  // ─── Step 2 — Complete registration ─────────────────────────────────────────

  return (
    <form onSubmit={handleRegister} className="space-y-4" noValidate>
      {error && <Alert variant="error">{error}</Alert>}

      <div className="rounded-lg bg-xxm-green/5 border border-xxm-green/20 px-4 py-3 text-sm text-xxm-green space-y-1">
        <p className="font-semibold">Invite verified</p>
        <p>Code: <span className="font-mono">{inviteCode}</span></p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="firstName" required>First name</Label>
          <Input id="firstName" name="firstName" defaultValue={prefilled?.firstName} placeholder="Kurhula" minLength={2} required />
        </div>
        <div>
          <Label htmlFor="lastName" required>Last name</Label>
          <Input id="lastName" name="lastName" defaultValue={prefilled?.lastName} placeholder="Maluleke" minLength={2} required />
        </div>
      </div>

      <div>
        <Label htmlFor="emailDisplay">Email address</Label>
        <Input id="emailDisplay" value={prefilled?.email ?? ''} readOnly disabled
          className="bg-gray-50 text-gray-500 cursor-not-allowed" />
        <p className="text-xs text-gray-400 mt-1">Locked to your invite. Cannot be changed.</p>
      </div>

      <div>
        <Label htmlFor="phoneDisplay">SA mobile number</Label>
        <Input id="phoneDisplay" value={prefilled?.phone ?? ''} readOnly disabled
          className="bg-gray-50 text-gray-500 cursor-not-allowed" />
        <p className="text-xs text-gray-400 mt-1">Locked to your invite. Cannot be changed.</p>
      </div>

      <div>
        <Label htmlFor="idNumber">SA ID number <span className="text-gray-400 font-normal">(optional)</span></Label>
        <Input id="idNumber" name="idNumber" placeholder="13-digit ID number" maxLength={13} />
      </div>

      <div>
        <Label htmlFor="password" required>Password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password"
          placeholder="Min. 8 chars, 1 uppercase, 1 number" required minLength={8} />
      </div>

      <div className="flex items-start gap-2 pt-1">
        <input
          id="consentToPopia"
          name="consentToPopia"
          type="checkbox"
          required
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-xxm-green accent-xxm-green cursor-pointer"
        />
        <Label htmlFor="consentToPopia" className="mb-0 font-normal text-gray-600 cursor-pointer">
          I consent to the processing of my personal information in accordance with POPIA.
        </Label>
      </div>

      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Create account
      </Button>

      <button
        type="button"
        onClick={() => { setStep(1); setError(''); setPrefilled(null) }}
        className="w-full text-sm text-gray-500 hover:text-gray-700 text-center"
      >
        ← Use a different code
      </button>
    </form>
  )
}
