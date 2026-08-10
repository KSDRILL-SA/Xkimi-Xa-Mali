'use client'

import { useActionState, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
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

  /**
   * What is about to be sent, shown back before it is.
   *
   * An invitation is a credential: whoever receives the code can register into
   * a circle that holds real money, and the invite carries the intended
   * person's name and phone number with it. One wrong character in an address
   * hands all of that to a stranger, and the admin's first hint is somebody
   * they do not know appearing in the members list.
   *
   * The fields stay mounted while this shows — hidden inputs are still
   * submitted, only disabled ones are not — so the form the review describes is
   * exactly the form that gets sent.
   */
  const [review, setReview] = useState<null | { name: string; email: string; phone: string; idNumber: string }>(null)

  function openReview(form: HTMLFormElement) {
    if (!form.reportValidity()) return
    const fd = new FormData(form)
    setReview({
      name: `${String(fd.get('firstName') ?? '')} ${String(fd.get('lastName') ?? '')}`.trim(),
      email: String(fd.get('email') ?? ''),
      phone: String(fd.get('phone') ?? ''),
      idNumber: String(fd.get('idNumber') ?? ''),
    })
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

            {review && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
                <p className="text-sm font-semibold text-amber-900">Send this invitation?</p>
                <p className="text-xs text-amber-800">
                  The code goes to <span className="font-bold">{review.email}</span> and{' '}
                  <span className="font-bold">{review.phone}</span>. Whoever receives it can
                  register as <span className="font-bold">{review.name}</span>, ID{' '}
                  <span className="font-bold">{review.idNumber}</span>, and join the
                  Foundation. Check the address before sending — an invitation sent to the
                  wrong person can be revoked, but only once somebody notices.
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                fullWidth
                onClick={() => (review ? setReview(null) : onClose())}
                disabled={isPending}
              >
                {review ? 'Back' : 'Cancel'}
              </Button>
              {review ? (
                <Button type="submit" fullWidth loading={isPending}>
                  Send invitation
                </Button>
              ) : (
                <Button
                  type="button"
                  fullWidth
                  onClick={(e) => openReview((e.currentTarget as HTMLElement).closest('form') as HTMLFormElement)}
                >
                  Review
                </Button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}
