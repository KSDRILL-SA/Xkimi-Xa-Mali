'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateBankAccountSchema, type CreateBankAccountInput } from '@/lib/validation/profile'
import { SA_BANKS, getUniversalBranchCode } from '@/lib/sa-banks'
import { api, ApiClientError } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { Select } from '@/components/ui/Select'
import { Alert } from '@/components/ui/Alert'

interface Props {
  onCancel: () => void
  onSuccess: () => void | Promise<void>
}

export function BankAccountForm({ onCancel, onSuccess }: Props) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<CreateBankAccountInput>({
    resolver: zodResolver(CreateBankAccountSchema),
    defaultValues: { accountType: 'SAVINGS' },
  })

  // Auto-fill the universal branch code when a bank is chosen
  function onBankChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const code = getUniversalBranchCode(e.target.value)
    if (code) setValue('branchCode', code, { shouldValidate: true })
  }

  async function onSubmit(data: CreateBankAccountInput) {
    setLoading(true)
    setError('')
    try {
      await api.post('/api/v1/bank-accounts', data)
      await onSuccess()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to add account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="rounded-xl border border-xxm-green-100 bg-xxm-green-50/50 p-4 space-y-4" noValidate>
      {error && <Alert variant="error">{error}</Alert>}

      <div>
        <Label htmlFor="bankName" required>Bank</Label>
        <Select id="bankName" error={errors.bankName?.message} {...register('bankName', { onChange: onBankChange })}>
          <option value="">Select your bank…</option>
          {SA_BANKS.map((b) => (
            <option key={b.name} value={b.name}>{b.name}</option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="accountNumber" required>Account number</Label>
          <Input id="accountNumber" inputMode="numeric" placeholder="6–12 digits" error={errors.accountNumber?.message} {...register('accountNumber')} />
        </div>
        <div>
          <Label htmlFor="branchCode" required>Branch code</Label>
          <Input id="branchCode" inputMode="numeric" maxLength={6} placeholder="Auto-filled" error={errors.branchCode?.message} {...register('branchCode')} />
        </div>
      </div>

      <div>
        <Label htmlFor="accountType" required>Account type</Label>
        <Select id="accountType" error={errors.accountType?.message} {...register('accountType')}>
          <option value="SAVINGS">Savings</option>
          <option value="CHEQUE">Cheque / Current</option>
          <option value="TRANSMISSION">Transmission</option>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <input id="isPrimary" type="checkbox" className="h-4 w-4 rounded border-gray-300 accent-xxm-green cursor-pointer" {...register('isPrimary')} />
        <Label htmlFor="isPrimary" className="mb-0 font-normal text-gray-600 cursor-pointer">
          Set as primary account
        </Label>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button type="submit" size="sm" loading={loading}>Add account</Button>
      </div>
    </form>
  )
}
