'use client'

import { useState, useRef } from 'react'
import { Button, Input, Label, Alert } from '@xxm/ui'
import { Check, Copy, X, UserPlus } from 'lucide-react'

type CreatedInvite = {
  code: string; firstName: string; lastName: string; email: string
}

export function CreateInviteModal({ onCreated }: { onCreated?: () => void }) {
  const [open,    setOpen]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [created, setCreated] = useState<CreatedInvite | null>(null)
  const [copied,  setCopied]  = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const fd  = new FormData(e.currentTarget)
    const res = await fetch(`${process.env['NEXT_PUBLIC_WEB_URL'] ?? ''}/api/v1/admin/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName:     fd.get('firstName'),
        lastName:      fd.get('lastName'),
        email:         fd.get('email'),
        phone:         fd.get('phone'),
        minimumAmount: Number(fd.get('minimumAmount')),
      }),
    })

    const json = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(json.error?.message ?? 'Failed to create invitation.')
      return
    }

    setCreated(json.data)
    formRef.current?.reset()
    onCreated?.()
  }

  function handleCopy() {
    if (!created) return
    navigator.clipboard.writeText(created.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleClose() {
    setOpen(false)
    setCreated(null)
    setError('')
    setCopied(false)
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
        <UserPlus size={14} aria-hidden />
        New Invite
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xxm-lg w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-xxm-green">Create Invitation</h2>
              <button onClick={handleClose} className="w-8 h-8 rounded-full flex items-center justify-center text-xxm-gray-400 hover:bg-xxm-gray-100 hover:text-xxm-gray-600 transition-colors" aria-label="Close">
                <X size={16} />
              </button>
            </div>

            {created ? (
              <div className="space-y-4">
                <Alert variant="success" title={`Invite created for ${created.firstName} ${created.lastName}`}>
                  Code sent to their phone and email. Copy it below as a backup.
                </Alert>
                <div className="bg-xxm-green-50 border border-xxm-green-200 rounded-xl px-4 py-4 text-center">
                  <span className="font-mono text-2xl font-bold tracking-widest text-xxm-green">{created.code}</span>
                  <p className="text-xs text-red-600 font-medium mt-2">This code will not be shown again.</p>
                </div>
                <Button variant="secondary" fullWidth onClick={handleCopy}>
                  {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy code</>}
                </Button>
                <Button variant="outline" fullWidth onClick={handleClose}>Done</Button>
              </div>
            ) : (
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                {error && <Alert variant="error">{error}</Alert>}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-fn">First name *</Label>
                    <Input id="invite-fn" name="firstName" required minLength={2} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-ln">Last name *</Label>
                    <Input id="invite-ln" name="lastName"  required minLength={2} />
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
                  <Input id="invite-amount" name="minimumAmount" type="number" min={100} step={50} defaultValue="200" required />
                </div>

                <div className="flex gap-3 pt-1">
                  <Button type="button" variant="outline" fullWidth onClick={handleClose} disabled={loading}>Cancel</Button>
                  <Button type="submit" fullWidth loading={loading}>Create invite</Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
