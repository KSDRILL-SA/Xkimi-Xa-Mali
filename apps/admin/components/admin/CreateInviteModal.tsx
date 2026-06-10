'use client'

import { useActionState, useState } from 'react'
import { Button, Input, Label, Alert } from '@xxm/ui'
import { Check, Copy, X, UserPlus } from 'lucide-react'
import { MIN_CONTRIBUTION_ZAR, CONTRIBUTION_STEP_ZAR, DEFAULT_INVITE_AMOUNT } from '@xxm/utils'

type CreatedInvite = { code: string; firstName: string; lastName: string; email: string }
type InviteState   = { data?: CreatedInvite; error?: string }

type Props = {
  createAction: (prev: InviteState, fd: FormData) => Promise<InviteState>
}

export function CreateInviteModal({ createAction }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <UserPlus size={14} aria-hidden />
        New Invite
      </Button>

      {open && (
        <ModalContent createAction={createAction} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

function ModalContent({
  createAction,
  onClose,
}: {
  createAction: (prev: InviteState, fd: FormData) => Promise<InviteState>
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [state, formAction, isPending] = useActionState(createAction, {})

  function handleCopy() {
    if (!state.data) return
    navigator.clipboard.writeText(state.data.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xxm-lg w-full max-w-md p-6 space-y-5 animate-scale-in">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-xxm-green">Create Invitation</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-xxm-gray-400 hover:bg-xxm-gray-100 hover:text-xxm-gray-600 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {state.data ? (
          <div className="space-y-4">
            <Alert variant="success" title={`Invite created for ${state.data.firstName} ${state.data.lastName}`}>
              Code sent to their phone and email. Copy it below as a backup.
            </Alert>
            <div className="bg-xxm-green-50 border border-xxm-green-200 rounded-xl px-4 py-4 text-center">
              <span className="font-mono text-2xl font-bold tracking-widest text-xxm-green">
                {state.data.code}
              </span>
              <p className="text-xs text-red-600 font-medium mt-2">This code will not be shown again.</p>
            </div>
            <Button variant="secondary" fullWidth onClick={handleCopy}>
              {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy code</>}
            </Button>
            <Button variant="outline" fullWidth onClick={onClose}>Done</Button>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            {state.error && <Alert variant="error">{state.error}</Alert>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="invite-fn">First name *</Label>
                <Input id="invite-fn" name="firstName" required minLength={2} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-ln">Last name *</Label>
                <Input id="invite-ln" name="lastName" required minLength={2} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email address *</Label>
              <Input id="invite-email" name="email" type="email" required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-phone">SA mobile number *</Label>
              <Input id="invite-phone" name="phone" type="tel" placeholder="0821234567" required />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-amount">Minimum monthly amount (R) *</Label>
              <Input
                id="invite-amount"
                name="minimumAmount"
                type="number"
                min={MIN_CONTRIBUTION_ZAR}
                step={CONTRIBUTION_STEP_ZAR}
                defaultValue={String(DEFAULT_INVITE_AMOUNT)}
                required
              />
            </div>

            <div className="flex gap-3 pt-1">
              <Button type="button" variant="outline" fullWidth onClick={onClose} disabled={isPending}>
                Cancel
              </Button>
              <Button type="submit" fullWidth loading={isPending}>
                Create invite
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
