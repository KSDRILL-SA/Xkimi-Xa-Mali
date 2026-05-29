'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { UpdateProfileSchema, type UpdateProfileInput, type AddressInput, SA_PROVINCES } from '@/lib/validation/profile'
import { api, ApiClientError } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { FormGroup } from '@/components/ui/FormGroup'
import { Alert } from '@/components/ui/Alert'

interface Address {
  line1?: string
  line2?: string
  city?: string
  province?: string
  postalCode?: string
}

interface Props {
  userId: string
  initial: {
    firstName: string
    lastName: string
    phone: string
    email: string
    idNumberMasked: string | null
    address: Address | null
  }
}

export function ProfileForm({ userId, initial }: Props) {
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors, isDirty } } = useForm<UpdateProfileInput>({
    resolver: zodResolver(UpdateProfileSchema),
    defaultValues: {
      firstName: initial.firstName,
      lastName:  initial.lastName,
      phone:     initial.phone,
      address: initial.address
        ? {
            line1:      initial.address.line1      ?? '',
            line2:      initial.address.line2      ?? '',
            city:       initial.address.city       ?? '',
            province:   initial.address.province   as AddressInput['province'],
            postalCode: initial.address.postalCode ?? '',
          }
        : undefined,
    },
  })

  async function onSubmit(data: UpdateProfileInput) {
    setLoading(true)
    setStatus(null)
    try {
      await api.patch(`/api/v1/members/${userId}`, data)
      setStatus({ type: 'success', msg: 'Profile updated successfully.' })
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : 'Update failed. Please try again.'
      setStatus({ type: 'error', msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      {status && <Alert variant={status.type}>{status.msg}</Alert>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormGroup label="First name" htmlFor="firstName" required error={errors.firstName?.message}>
          <Input id="firstName" {...register('firstName')} />
        </FormGroup>
        <FormGroup label="Last name" htmlFor="lastName" required error={errors.lastName?.message}>
          <Input id="lastName" {...register('lastName')} />
        </FormGroup>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormGroup label="Email" htmlFor="email" hint="Read-only — contact admin to change">
          <Input id="email" value={initial.email} disabled />
        </FormGroup>
        <FormGroup label="Mobile number" htmlFor="phone" required error={errors.phone?.message}>
          <Input id="phone" type="tel" {...register('phone')} />
        </FormGroup>
      </div>

      <FormGroup label="SA ID number" htmlFor="idNumber" hint="Read-only — contact admin to update">
        <Input id="idNumber" value={initial.idNumberMasked ?? 'Not provided'} disabled />
      </FormGroup>

      <div className="pt-2 border-t border-xxm-gray-100">
        <h4 className="text-sm font-semibold text-xxm-green-900 mb-4 mt-3">Address</h4>
        <div className="space-y-4">
          <FormGroup label="Street address" htmlFor="line1" error={errors.address?.line1?.message}>
            <Input id="line1" placeholder="123 Main Street" {...register('address.line1')} />
          </FormGroup>

          <FormGroup label="Apartment, suite, etc." htmlFor="line2" hint="Optional">
            <Input id="line2" {...register('address.line2')} />
          </FormGroup>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormGroup label="City" htmlFor="city" error={errors.address?.city?.message}>
              <Input id="city" {...register('address.city')} />
            </FormGroup>
            <FormGroup label="Province" htmlFor="province" error={errors.address?.province?.message}>
              <Select id="province" {...register('address.province')}>
                <option value="">Select…</option>
                {SA_PROVINCES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            </FormGroup>
            <FormGroup label="Postal code" htmlFor="postalCode" error={errors.address?.postalCode?.message}>
              <Input id="postalCode" maxLength={4} {...register('address.postalCode')} />
            </FormGroup>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={loading} disabled={!isDirty}>Save changes</Button>
      </div>
    </form>
  )
}
