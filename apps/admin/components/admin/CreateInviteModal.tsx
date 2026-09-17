'use client'

import { useActionState, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Button, Input, Label, Alert } from '@xxm/ui'
import { Check, Copy, X, UserPlus } from 'lucide-react'
import { MIN_CONTRIBUTION_ZAR, CONTRIBUTION_STEP_ZAR, DEFAULT_INVITE_AMOUNT } from '@xxm/utils'
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton'

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

  /**
   * What is about to be sent, read fresh and shown back before it goes.
   *
   * An invitation is a credential: whoever receives the code can register into
   * a circle that holds real money, and the invite carries the intended
   * person's name and phone number with it. One wrong character in an address
   * hands all of that to a stranger, and the admin's first hint is somebody
   * they do not know appearing in the members list.
   *
   * `ConfirmSubmitButton` owns the actual gate — see its own docblock for why
   * a *separate* dialog, rather than swapping this button for a real submit
   * button in the same spot, is what a confirmation step has to be.
   */
  function reviewMessage(form: HTMLFormElement | null): string {
    if (!form) return 'Review the details before sending.'
    const fd = new FormData(form)
    const name = `${String(fd.get('firstName') ?? '')} ${String(fd.get('lastName') ?? '')}`.trim()
    const email = String(fd.get('email') ?? '')
    const phone = String(fd.get('phone') ?? '')
    const idNumber = String(fd.get('idNumber') ?? '')
    return (
      `The code goes to ${email} and ${phone}. Whoever receives it can register as ` +
      `${name}, ID ${idNumber}, and join the Foundation. Check the address before ` +
      'sending — an invitation sent to the wrong person can be revoked, but only ' +
      'once somebody notices.'
    )
  }

  // Portal target only exists on the client — wait for mount before rendering.
  //
  // Read as external state rather than set from an effect. The effect version
  // rendered null, committed, set state, and rendered again — a cascading
  // render on every open, and the thing react-hooks/set-state-in-effect flags.
  // useSyncExternalStore answers false on the server and true on the client
  // without a second pass; the store never changes, so it never subscribes.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  )

  function handleCopy() {
    if (!state.data) return
    navigator.clipboard.writeText(state.data.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xxm-lg w-full max-w-md max-h-full overflow-y-auto p-6 space-y-5 animate-scale-in">
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
              <Input id="invite-email" name="email" type="email" placeholder="name@gmail.com" required />
            </div>

            {/* The identity leadership is vouching for.
                Recorded here because the admin is the one who knows this
                person. The member confirms it at registration rather than
                supplying it — it used to be theirs to type, optionally, and
                nobody could correct it afterwards. */}
            <div className="space-y-1.5">
              <Label htmlFor="invite-id">SA ID number *</Label>
              <Input
                id="invite-id"
                name="idNumber"
                inputMode="numeric"
                pattern="\d{13}"
                maxLength={13}
                placeholder="13 digits"
                required
              />
              <p className="text-[11px] text-xxm-gray-400">
                They will be asked to confirm this when they register, so check the digits.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-vouched">How do you know them?</Label>
              <Input id="invite-vouched" name="vouchedFor" maxLength={200} placeholder="Optional — e.g. cousin, worked together since 2019" />
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
              <Button
                type="button"
                variant="outline"
                fullWidth
                onClick={onClose}
                disabled={isPending}
              >
                Cancel
              </Button>
              <ConfirmSubmitButton
                className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold bg-xxm-green text-white transition-all duration-fast ease-smooth hover:bg-xxm-canopy hover:-translate-y-0.5 shadow-xxm-sm hover:shadow-xxm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none"
                title="Send this invitation?"
                message="Review the details before sending."
                getMessage={reviewMessage}
                confirmLabel="Send invitation"
                disabled={isPending}
              >
                {isPending ? 'Sending…' : 'Review & Send'}
              </ConfirmSubmitButton>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}
