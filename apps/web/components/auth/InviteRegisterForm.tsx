'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { RegisterStep2Schema, type RegisterStep2Input } from '@/lib/validation/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormGroup } from '@/components/ui/FormGroup'
import { Alert } from '@/components/ui/Alert'

type InviteData = {
  firstName: string
  lastName: string
  email: string
  phone: string
  minimumAmount: number
}

type Props = {
  invite: InviteData
  inviteCode: string
}

export function InviteRegisterForm({ invite, inviteCode }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { register, handleSubmit, formState: { errors }, setValue } = useForm<RegisterStep2Input>({
    resolver: zodResolver(RegisterStep2Schema),
    defaultValues: {
      firstName: invite.firstName,
      lastName: invite.lastName,
      consentToPopia: false,
    },
  })

  async function onSubmit(data: RegisterStep2Input) {
    setLoading(true)
    setError('')

    const res = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inviteCode:     inviteCode.trim().toUpperCase(),
        email:          invite.email,
        phone:          invite.phone,
        firstName:      data.firstName.trim(),
        lastName:       data.lastName.trim(),
        idNumber:       data.idNumber || undefined,
        password:       data.password,
        consentToPopia: true,
      }),
    })

    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(json.error?.message ?? 'Registration failed. Please try again.')
      return
    }

    router.push('/verify-email?sent=true')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {error && <Alert variant="error">{error}</Alert>}

      <div className="rounded-xl bg-xxm-green/5 border border-xxm-green/20 px-4 py-3 text-sm text-xxm-green-900 space-y-0.5">
        <p className="font-semibold">You&apos;ve been invited to join</p>
        <p className="text-gray-500 text-xs">Your email and phone are bound to this invite and cannot be changed.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormGroup label="First name" htmlFor="firstName" required error={errors.firstName?.message}>
          <Input id="firstName" placeholder="Kurhula" {...register('firstName')} />
        </FormGroup>
        <FormGroup label="Last name" htmlFor="lastName" required error={errors.lastName?.message}>
          <Input id="lastName" placeholder="Maluleke" {...register('lastName')} />
        </FormGroup>
      </div>

      <FormGroup label="Email address" htmlFor="emailDisplay" hint="Locked to your invite — cannot be changed.">
        <Input id="emailDisplay" value={invite.email} readOnly disabled />
      </FormGroup>

      <FormGroup label="SA mobile number" htmlFor="phoneDisplay" hint="Locked to your invite — cannot be changed.">
        <Input id="phoneDisplay" value={invite.phone} readOnly disabled />
      </FormGroup>

      <FormGroup label="SA ID number" htmlFor="idNumber" hint="Optional" error={errors.idNumber?.message}>
        <Input id="idNumber" placeholder="13-digit ID number" maxLength={13} {...register('idNumber')} />
      </FormGroup>

      <FormGroup
        label="Password"
        htmlFor="password"
        required
        error={errors.password?.message}
        hint="Min. 8 characters, 1 uppercase, 1 number"
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          placeholder="Min. 8 chars, 1 uppercase, 1 number"
          {...register('password')}
        />
      </FormGroup>

      <div className="flex items-start gap-2 pt-1">
        <input
          id="consentToPopia"
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-xxm-gray-300 text-xxm-green accent-xxm-green cursor-pointer"
          onChange={(e) => setValue('consentToPopia', e.target.checked)}
        />
        <div>
          <label htmlFor="consentToPopia" className="text-sm font-normal text-xxm-gray-600 cursor-pointer">
            I consent to the processing of my personal information in accordance with POPIA.
          </label>
          {errors.consentToPopia && (
            <p className="text-xs text-red-500 mt-0.5">{errors.consentToPopia.message}</p>
          )}
        </div>
      </div>

      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Create account
      </Button>
    </form>
  )
}
