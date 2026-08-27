'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { CheckCircle, User, IdCard, Lock } from 'lucide-react'
import { RegisterStep2Schema, type RegisterStep2Input } from '@/lib/validation/auth'
import { api, ApiClientError } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormGroup } from '@/components/ui/FormGroup'
import { Alert } from '@/components/ui/Alert'
import { Stepper } from '@/components/ui/Stepper'

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
  // A code arriving on the link (?code=XKM-...) is known at first render, so
  // both the field and the spinner start from it rather than being assigned
  // from an effect. Setting them there rendered the empty form first, then
  // immediately re-rendered it filled — a visible flash, and a cascading
  // render that `react-hooks/set-state-in-effect` flags.
  const urlCode = searchParams.get('code')?.trim().toUpperCase() ?? ''

  const [step, setStep]         = useState<1 | 2>(1)
  const [inviteCode, setInviteCode] = useState(urlCode)
  const [prefilled, setPrefilled]   = useState<PrefilledData | null>(null)
  const [loading, setLoading]   = useState(Boolean(urlCode))
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)

  const step2Form = useForm<RegisterStep2Input>({
    resolver: zodResolver(RegisterStep2Schema),
    defaultValues: { consentToPopia: false },
  })

  // Auto-validate the code that arrived on the link. Only the network call
  // lives here now; everything it sets is set from a resolved promise, not
  // synchronously during the effect.
  useEffect(() => {
    if (!urlCode) return
    api.post<PrefilledData>('/api/v1/auth/invitations/validate', { code: urlCode })
      .then((data) => {
        setPrefilled(data)
        setStep(2)
      })
      .catch((err: unknown) => {
        setError(err instanceof ApiClientError ? err.message : 'This invite link is invalid or has expired.')
      })
      .finally(() => setLoading(false))
  }, [urlCode])

  // ─── Step 1 — validate invite code ─────────────────────────────────────────

  async function handleValidateCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const data = await api.post<PrefilledData>('/api/v1/auth/invitations/validate', {
        code: inviteCode.trim().toUpperCase(),
      })
      setPrefilled(data)
      setStep(2)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Invalid invite code. Please check and try again.')
    } finally {
      setLoading(false)
    }
  }

  // ─── Step 2 — complete registration ────────────────────────────────────────

  async function handleRegister(data: RegisterStep2Input) {
    setLoading(true)
    setError('')

    try {
      await api.post('/api/v1/auth/register', {
        inviteCode:     inviteCode.trim().toUpperCase(),
        email:          prefilled?.email ?? '',
        phone:          prefilled?.phone ?? '',
        firstName:      data.firstName.trim(),
        lastName:       data.lastName.trim(),
        idNumber:       data.idNumber || undefined,
        password:       data.password,
        consentToPopia: true,
      })
      setSuccess(true)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ─── Success screen ─────────────────────────────────────────────────────────

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <div className="w-16 h-16 rounded-full bg-xxm-green-100 flex items-center justify-center mx-auto animate-scale-in">
          <CheckCircle className="w-8 h-8 text-xxm-green" aria-hidden />
        </div>
        <h2 className="font-display text-xl font-bold text-xxm-green-900">Check your email</h2>
        <p className="text-gray-600 text-sm">
          We sent a verification link to <strong>{prefilled?.email}</strong>. Click the link to activate your account.
        </p>
        <Button variant="ghost" size="sm" onClick={() => router.push('/login')}>
          Back to login
        </Button>
      </div>
    )
  }

  const STEPS = [
    { label: 'Invite code',  description: 'Validate your invite' },
    { label: 'Your details', description: 'Complete your profile' },
  ]

  // ─── Step 1 — Enter invite code ─────────────────────────────────────────────

  if (step === 1) {
    return (
      <div className="space-y-6">
        <Stepper steps={STEPS} currentStep={0} />
        <form onSubmit={handleValidateCode} className="space-y-4" noValidate>
          {error && <Alert variant="error">{error}</Alert>}

          <FormGroup
            label="Invite code"
            htmlFor="inviteCode"
            required
            hint="Enter the code you received via SMS or email."
          >
            <Input
              id="inviteCode"
              placeholder="XKM-XXXX-XXXX"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              maxLength={12}
              className="font-mono tracking-widest text-center"
            />
          </FormGroup>

          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Validate code
          </Button>

          <p className="text-center text-sm text-xxm-gray-600">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-xxm-green hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    )
  }

  // ─── Step 2 — Complete registration ─────────────────────────────────────────

  const { register: reg2, handleSubmit: submit2, formState: { errors: e2 }, setValue: set2 } = step2Form

  return (
    <div className="space-y-6">
      <Stepper steps={STEPS} currentStep={1} />

      {/* `method="post"` is a fallback only — see LoginForm.tsx for why a
          password field needs one even though `onSubmit` always intercepts. */}
      <form onSubmit={submit2(handleRegister)} method="post" className="space-y-4" noValidate>
        {error && <Alert variant="error">{error}</Alert>}

        <div className="rounded-xl bg-xxm-green/5 border border-xxm-green/20 px-4 py-3 text-sm text-xxm-green space-y-1">
          <p className="font-semibold">Invite verified</p>
          <p>Code: <span className="font-mono">{inviteCode}</span></p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormGroup label="First name" htmlFor="firstName" required error={e2.firstName?.message}>
            <Input id="firstName" placeholder="Kurhula" icon={User} defaultValue={prefilled?.firstName} {...reg2('firstName')} />
          </FormGroup>
          <FormGroup label="Last name" htmlFor="lastName" required error={e2.lastName?.message}>
            <Input id="lastName" placeholder="Maluleke" icon={User} defaultValue={prefilled?.lastName} {...reg2('lastName')} />
          </FormGroup>
        </div>

        <FormGroup label="Email address" htmlFor="emailDisplay" hint="Locked to your invite — cannot be changed.">
          <Input id="emailDisplay" value={prefilled?.email ?? ''} readOnly disabled />
        </FormGroup>

        <FormGroup label="SA mobile number" htmlFor="phoneDisplay" hint="Locked to your invite — cannot be changed.">
          <Input id="phoneDisplay" value={prefilled?.phone ?? ''} readOnly disabled />
        </FormGroup>

        <FormGroup label="SA ID number" htmlFor="idNumber" hint="Optional" error={e2.idNumber?.message}>
          <Input id="idNumber" placeholder="13-digit ID number" icon={IdCard} maxLength={13} {...reg2('idNumber')} />
        </FormGroup>

        <FormGroup label="Password" htmlFor="password" required error={e2.password?.message} hint="At least 12 characters. A short phrase you will remember works well.">
          <Input id="password" type="password" autoComplete="new-password" placeholder="At least 12 characters" icon={Lock} {...reg2('password')} />
        </FormGroup>

        <div className="flex items-start gap-2 pt-1">
          <input
            id="consentToPopia"
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-xxm-gray-300 text-xxm-green accent-xxm-green cursor-pointer"
            onChange={(e) => set2('consentToPopia', e.target.checked)}
          />
          <div>
            <label htmlFor="consentToPopia" className="text-sm font-normal text-xxm-gray-600 cursor-pointer">
              I consent to the processing of my personal information in accordance with POPIA.
            </label>
            {e2.consentToPopia && (
              <p className="text-xs text-red-500 mt-0.5">{e2.consentToPopia.message}</p>
            )}
          </div>
        </div>

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Create account
        </Button>

        <button
          type="button"
          onClick={() => { setStep(1); setError(''); setPrefilled(null) }}
          className="w-full text-sm text-xxm-gray-500 hover:text-xxm-gray-700 text-center"
        >
          ← Use a different code
        </button>
      </form>
    </div>
  )
}
