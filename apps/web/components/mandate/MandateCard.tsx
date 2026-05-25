'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatZAR } from '@/lib/formatters'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { DelayForm } from './DelayForm'
import { EditMandateForm } from './EditMandateForm'

type MandateStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'

type MandateData = {
  id: string
  status: MandateStatus
  amount: string | number
  debitDay: number
  createdAt: string | Date
  bankAccount: {
    bankName: string
    accountNumberMasked: string
    accountType: string
  }
}

const STATUS_CONFIG: Record<MandateStatus, { label: string; classes: string }> = {
  PENDING:   { label: 'Pending',   classes: 'bg-amber-100 text-amber-700' },
  ACTIVE:    { label: 'Active',    classes: 'bg-green-100 text-green-700' },
  SUSPENDED: { label: 'Suspended', classes: 'bg-red-100 text-red-700' },
  CANCELLED: { label: 'Cancelled', classes: 'bg-gray-100 text-gray-500' },
}

interface Props {
  mandate: MandateData
}

export function MandateCard({ mandate }: Props) {
  const router = useRouter()
  const [showEdit, setShowEdit] = useState(false)
  const [showDelay, setShowDelay] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const status = STATUS_CONFIG[mandate.status] ?? STATUS_CONFIG.SUSPENDED
  const canManage = mandate.status === 'ACTIVE' || mandate.status === 'PENDING'
  const canDelay = mandate.status === 'ACTIVE'

  async function handleCancel() {
    setCancelling(true)
    try {
      await api.delete(`/api/v1/mandates/${mandate.id}`)
      router.refresh()
    } catch {
      setCancelling(false)
    }
    setShowCancel(false)
  }

  return (
    <>
      <Card>
        <div className="p-5">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span
                  className={`status-pill text-xs font-semibold ${status.classes}`}
                >
                  {status.label}
                </span>
              </div>
              <p className="text-xl font-bold text-xxm-green-900 amount">
                {formatZAR(mandate.amount)}
                <span className="text-sm font-normal text-gray-400 ml-1">/month</span>
              </p>
            </div>

            {/* Debit day badge */}
            <div className="flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-xxm-green-100 flex-shrink-0">
              <span className="text-xs text-xxm-green-700 font-medium leading-none">Day</span>
              <span className="text-2xl font-black text-xxm-green-900 leading-tight">
                {mandate.debitDay}
              </span>
            </div>
          </div>

          {/* Bank account details */}
          <div className="mt-4 p-3 rounded-lg bg-gray-50 space-y-1">
            <p className="text-sm font-medium text-gray-700">{mandate.bankAccount.bankName}</p>
            <p className="text-xs text-gray-400 font-mono tracking-wider">
              {mandate.bankAccount.accountNumberMasked}
            </p>
            <p className="text-xs text-gray-400 capitalize">
              {mandate.bankAccount.accountType.toLowerCase()} account
            </p>
          </div>

          {/* Actions */}
          {canManage && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>
                Edit
              </Button>
              {canDelay && (
                <Button size="sm" variant="outline" onClick={() => setShowDelay(true)}>
                  Delay debit
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-200 hover:bg-red-50 ml-auto"
                onClick={() => setShowCancel(true)}
              >
                Cancel mandate
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* Edit modal */}
      {showEdit && (
        <Modal title="Edit mandate" onClose={() => setShowEdit(false)}>
          <EditMandateForm
            mandateId={mandate.id}
            currentDebitDay={mandate.debitDay}
            currentAmount={Number(mandate.amount)}
            onClose={() => setShowEdit(false)}
          />
        </Modal>
      )}

      {/* Delay modal */}
      {showDelay && (
        <Modal title="Delay debit" onClose={() => setShowDelay(false)}>
          <DelayForm mandateId={mandate.id} onClose={() => setShowDelay(false)} />
        </Modal>
      )}

      {/* Cancel confirmation */}
      <ConfirmModal
        open={showCancel}
        title="Cancel mandate?"
        message="Your debit order will be cancelled with Netcash. You won't be debited next month unless you create a new mandate."
        confirmLabel="Yes, cancel"
        loading={cancelling}
        onConfirm={handleCancel}
        onCancel={() => setShowCancel(false)}
      />
    </>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-xxm-green-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}
