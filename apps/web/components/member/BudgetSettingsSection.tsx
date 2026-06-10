'use client'

import { useState } from 'react'
import { api, ApiClientError } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Alert } from '@/components/ui/Alert'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { formatZAR, formatDate } from '@/lib/formatters'

export interface BudgetItem {
  id: string
  type: 'MONTHLY' | 'YEARLY' | 'CUSTOM'
  amount: number
  startDate: string
  endDate: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface BudgetOverrideItem {
  id: string
  budgetId: string
  contributionId: string | null
  attemptedAmount: number
  budgetAmount: number
  overageAmount: number
  reason: string | null
  createdAt: string
}

const MIN_BUDGET = 100
const MAX_BUDGET = 10000
const STEP = 50

const BUDGET_TYPES = ['MONTHLY', 'YEARLY'] as const
type SettableBudgetType = (typeof BUDGET_TYPES)[number]

const TYPE_LABELS: Record<SettableBudgetType, string> = {
  MONTHLY: 'Monthly budget',
  YEARLY: 'Yearly budget',
}

const TYPE_HELP: Record<SettableBudgetType, string> = {
  MONTHLY: "We'll warn you before a payment would push your contributions for this calendar month over this amount.",
  YEARLY: "Tracks your contributions over a rolling 12-month period and warns you before this amount is exceeded.",
}

interface Props {
  initial: BudgetItem[]
  initialOverrides: BudgetOverrideItem[]
}

export function BudgetSettingsSection({ initial, initialOverrides }: Props) {
  const [budgets, setBudgets] = useState<BudgetItem[]>(initial)
  const [overrides] = useState<BudgetOverrideItem[]>(initialOverrides)
  const [error, setError] = useState('')
  const [savingType, setSavingType] = useState<SettableBudgetType | null>(null)
  const [removeTarget, setRemoveTarget] = useState<SettableBudgetType | null>(null)
  const [removing, setRemoving] = useState(false)
  const [drafts, setDrafts] = useState<Partial<Record<SettableBudgetType, number>>>({})

  function activeBudget(type: SettableBudgetType) {
    return budgets.find((b) => b.type === type && b.isActive) ?? null
  }

  async function refresh() {
    const data = await api.get<BudgetItem[]>('/api/v1/budgets/me')
    setBudgets(data)
  }

  function clampAmount(amount: number) {
    return Math.min(MAX_BUDGET, Math.max(MIN_BUDGET, amount))
  }

  async function handleSave(type: SettableBudgetType) {
    const existing = activeBudget(type)
    const amount = clampAmount(drafts[type] ?? existing?.amount ?? MIN_BUDGET)
    setSavingType(type)
    setError('')
    try {
      if (existing) {
        await api.patch(`/api/v1/budgets/me/${type}`, { amount })
      } else {
        await api.post('/api/v1/budgets/me', {
          type,
          amount,
          startDate: new Date().toISOString(),
        })
      }
      setDrafts((d) => ({ ...d, [type]: undefined }))
      await refresh()
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to save budget')
    } finally {
      setSavingType(null)
    }
  }

  async function handleRemove() {
    if (!removeTarget) return
    setRemoving(true)
    setError('')
    try {
      await api.delete(`/api/v1/budgets/me/${removeTarget}`)
      await refresh()
      setRemoveTarget(null)
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Failed to remove budget')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="error">{error}</Alert>}

      <p className="text-sm text-gray-500">
        Set a contribution budget and we&apos;ll warn you before a payment would push you over it.
        Changes apply immediately.
      </p>

      <div className="space-y-4">
        {BUDGET_TYPES.map((type) => {
          const existing = activeBudget(type)
          const draft = clampAmount(drafts[type] ?? existing?.amount ?? MIN_BUDGET)
          const unchanged = Boolean(existing) && draft === existing?.amount

          return (
            <div key={type} className="rounded-xl border border-gray-200 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-xxm-green-900">{TYPE_LABELS[type]}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{TYPE_HELP[type]}</p>
                </div>
                {existing && (
                  <span className="status-pill bg-xxm-green-100 text-xxm-green-700 shrink-0">Active</span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={MIN_BUDGET}
                  max={MAX_BUDGET}
                  step={STEP}
                  value={draft}
                  onChange={(e) => setDrafts((d) => ({ ...d, [type]: Number(e.target.value) }))}
                  className="flex-1 accent-xxm-green"
                  aria-label={`${TYPE_LABELS[type]} amount`}
                />
                <Input
                  type="number"
                  min={MIN_BUDGET}
                  max={MAX_BUDGET}
                  step={STEP}
                  value={draft}
                  onChange={(e) => setDrafts((d) => ({ ...d, [type]: Number(e.target.value) }))}
                  className="w-28"
                  aria-label={`${TYPE_LABELS[type]} amount (ZAR)`}
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => handleSave(type)}
                  loading={savingType === type}
                  disabled={unchanged}
                >
                  {existing ? 'Update budget' : `Set ${formatZAR(draft)} budget`}
                </Button>
                {existing && (
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(type)}
                    className="text-sm text-red-500 hover:text-red-700 px-2"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {overrides.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-xxm-green-900 mb-2">Budget override history</p>
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-xxm-gray-50 text-xxm-gray-500">
                <tr>
                  <th className="text-left font-medium px-3 py-2">Date</th>
                  <th className="text-right font-medium px-3 py-2">Amount</th>
                  <th className="text-right font-medium px-3 py-2">Over by</th>
                  <th className="text-left font-medium px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((o) => (
                  <tr key={o.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-500">{formatDate(o.createdAt)}</td>
                    <td className="px-3 py-2 text-right font-medium text-xxm-green-900">{formatZAR(o.attemptedAmount)}</td>
                    <td className="px-3 py-2 text-right text-amber-600">{formatZAR(o.overageAmount)}</td>
                    <td className="px-3 py-2 text-gray-400">{o.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(removeTarget)}
        title="Remove budget"
        message={`Remove your ${removeTarget ? TYPE_LABELS[removeTarget].toLowerCase() : ''}? You will no longer be warned before exceeding this amount.`}
        confirmLabel="Remove"
        loading={removing}
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  )
}
