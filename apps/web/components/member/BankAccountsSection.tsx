'use client'

import { useState } from 'react'
import { api, ApiClientError } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { BankAccountForm } from './BankAccountForm'

export interface BankAccount {
  id: string
  bankName: string
  accountNumberMasked: string
  accountType: string
  branchCode: string
  isPrimary: boolean
  verifiedAt: string | null
}

export function BankAccountsSection({ initial }: { initial: BankAccount[] }) {
  const [accounts, setAccounts] = useState<BankAccount[]>(initial)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<BankAccount | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function refresh() {
    const data = await api.get<BankAccount[]>('/api/v1/bank-accounts')
    setAccounts(data)
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setError('')
    try {
      await api.delete(`/api/v1/bank-accounts/${deleteTarget.id}`)
      await refresh()
      setDeleteTarget(null)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to remove account')
    } finally {
      setDeleting(false)
    }
  }

  async function setPrimary(id: string) {
    setError('')
    try {
      await api.patch(`/api/v1/bank-accounts/${id}`, { isPrimary: true })
      await refresh()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to update account')
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}

      {accounts.length === 0 && !adding && (
        <div className="text-center py-8 text-sm text-gray-400">
          No bank accounts yet. Add one to set up contributions.
        </div>
      )}

      <div className="space-y-3">
        {accounts.map((acc) => (
          <div key={acc.id} className="flex items-center justify-between rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-xxm-green-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-xxm-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 10l9-7 9 7M5 10v10h14V10" />
                </svg>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-xxm-green-900">{acc.bankName}</p>
                  {acc.isPrimary && (
                    <span className="status-pill bg-xxm-gold/20 text-xxm-gold-dark">Primary</span>
                  )}
                  {acc.verifiedAt && (
                    <span className="xxm-status-success">Verified</span>
                  )}
                </div>
                <p className="text-xs text-gray-400 amount">
                  {acc.accountNumberMasked} · {acc.accountType} · Branch {acc.branchCode}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!acc.isPrimary && (
                <Button variant="ghost" size="sm" onClick={() => setPrimary(acc.id)}>
                  Set primary
                </Button>
              )}
              <button
                onClick={() => setDeleteTarget(acc)}
                className="text-sm text-red-500 hover:text-red-700 px-2"
                aria-label="Remove account"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <BankAccountForm
          onCancel={() => setAdding(false)}
          onSuccess={async () => {
            setAdding(false)
            await refresh()
          }}
        />
      ) : (
        <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
          + Add bank account
        </Button>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Remove bank account"
        message={`Remove your ${deleteTarget?.bankName} account ending ${deleteTarget?.accountNumberMasked.slice(-4)}? This cannot be undone.`}
        confirmLabel="Remove"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
