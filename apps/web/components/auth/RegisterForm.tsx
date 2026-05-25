'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { RegisterSchema, type RegisterInput } from '@/lib/validation/auth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Alert } from '@/components/ui/Alert'

export function RegisterForm() {
  const router = useRouter()
  const [serverError, setServerError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
  })

  async function onSubmit(data: RegisterInput) {
    setLoading(true)
    setServerError('')

    const res = await fetch('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      setServerError(json.error?.message ?? 'Registration failed. Please try again.')
      return
    }

    setSuccess(true)
  }

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
          We sent a verification link to your email address. Click the link to activate your account.
        </p>
        <Button variant="ghost" size="sm" onClick={() => router.push('/auth/login')}>
          Back to login
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {serverError && <Alert variant="error">{serverError}</Alert>}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="firstName" required>First name</Label>
          <Input id="firstName" placeholder="Kurhula" error={errors.firstName?.message} {...register('firstName')} />
        </div>
        <div>
          <Label htmlFor="lastName" required>Last name</Label>
          <Input id="lastName" placeholder="Maluleke" error={errors.lastName?.message} {...register('lastName')} />
        </div>
      </div>

      <div>
        <Label htmlFor="email" required>Email address</Label>
        <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" error={errors.email?.message} {...register('email')} />
      </div>

      <div>
        <Label htmlFor="phone" required>SA mobile number</Label>
        <Input id="phone" type="tel" placeholder="0821234567" error={errors.phone?.message} {...register('phone')} />
      </div>

      <div>
        <Label htmlFor="idNumber" required>SA ID number</Label>
        <Input id="idNumber" placeholder="13-digit ID number" maxLength={13} error={errors.idNumber?.message} {...register('idNumber')} />
      </div>

      <div>
        <Label htmlFor="password" required>Password</Label>
        <Input id="password" type="password" autoComplete="new-password" placeholder="Min. 8 chars, 1 uppercase, 1 number" error={errors.password?.message} {...register('password')} />
      </div>

      <div className="flex items-start gap-2 pt-1">
        <input
          id="consentToPopia"
          type="checkbox"
          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-xxm-green accent-xxm-green cursor-pointer"
          {...register('consentToPopia')}
        />
        <Label htmlFor="consentToPopia" className="mb-0 font-normal text-gray-600 cursor-pointer">
          I consent to the processing of my personal information in accordance with POPIA.
        </Label>
      </div>
      {errors.consentToPopia && <p className="text-xs text-red-600">{errors.consentToPopia.message}</p>}

      <Button type="submit" className="w-full" size="lg" loading={loading}>
        Create account
      </Button>

      <p className="text-center text-sm text-gray-600">
        Already have an account?{' '}
        <Link href="/auth/login" className="font-medium text-xxm-green hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  )
}
