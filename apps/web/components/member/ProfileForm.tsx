'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { UpdateProfileSchema, type UpdateProfileInput, type AddressInput, SA_PROVINCES } from '@/lib/validation/profile'
import { api, ApiClientError } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
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
      lastName: initial.lastName,
      phone: initial.phone,
      address: initial.address
        ? {
            line1: initial.address.line1 ?? '',
            line2: initial.address.line2 ?? '',
            city: initial.address.city ?? '',
            province: initial.address.province as AddressInput['province'],
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
        <div>
          <Label htmlFor="firstName" required>First name</Label>
          <Input id="firstName" error={errors.firstName?.message} {...register('firstName')} />
        </div>
        <div>
          <Label htmlFor="lastName" required>Last name</Label>
          <Input id="lastName" error={errors.lastName?.message} {...register('lastName')} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="email">Email (read-only)</Label>
          <Input id="email" value={initial.email} disabled className="bg-gray-50" />
        </div>
        <div>
          <Label htmlFor="phone" required>Mobile number</Label>
          <Input id="phone" type="tel" error={errors.phone?.message} {...register('phone')} />
        </div>
      </div>

      <div>
        <Label htmlFor="idNumber">SA ID number (read-only)</Label>
        <Input id="idNumber" value={initial.idNumberMasked ?? 'Not provided'} disabled className="bg-gray-50" />
      </div>

      <div className="pt-2 border-t border-gray-100">
        <h4 className="text-sm font-semibold text-xxm-green-900 mb-3 mt-3">Address</h4>
        <div className="space-y-4">
          <div>
            <Label htmlFor="line1">Street address</Label>
            <Input id="line1" placeholder="123 Main Street" error={errors.address?.line1?.message} {...register('address.line1')} />
          </div>
          <div>
            <Label htmlFor="line2">Apartment, suite, etc. (optional)</Label>
            <Input id="line2" {...register('address.line2')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="city">City</Label>
              <Input id="city" error={errors.address?.city?.message} {...register('address.city')} />
            </div>
            <div>
              <Label htmlFor="province">Province</Label>
              <Select id="province" error={errors.address?.province?.message} {...register('address.province')}>
                <option value="">Select…</option>
                {SA_PROVINCES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="postalCode">Postal code</Label>
              <Input id="postalCode" maxLength={4} error={errors.address?.postalCode?.message} {...register('address.postalCode')} />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" loading={loading} disabled={!isDirty}>Save changes</Button>
      </div>
    </form>
  )
}
