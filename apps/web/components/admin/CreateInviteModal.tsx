'use client'

import { useState, useRef } from 'react'
import { Check, Copy } from 'lucide-react'

type CreatedInvite = {
  code: string
  codePrefix: string
  firstName: string
  lastName: string
  email: string
}

export function CreateInviteModal({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [created, setCreated] = useState<CreatedInvite | null>(null)
  const [copied, setCopied]   = useState(false)
  const formRef               = useRef<HTMLFormElement>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const fd = new FormData(e.currentTarget)
    const res = await fetch('/api/v1/admin/invitations', {
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
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-lg bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-green/90 transition-colors"
      >
        New Invite
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-xxm-green">Create Invitation</h2>
              <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            {/* Code shown once after creation */}
            {created ? (
              <div className="space-y-4">
                <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center space-y-3">
                  <p className="text-sm font-semibold text-green-800">
                    Invite created for {created.firstName} {created.lastName}
                  </p>
                  <p className="text-xs text-green-600">
                    The code has been sent to their phone and email. Copy it below as a backup.
                  </p>
                  <div className="bg-white border border-green-300 rounded-lg px-4 py-3">
                    <span className="font-mono text-2xl font-bold tracking-widest text-xxm-green">
                      {created.code}
                    </span>
                  </div>
                  <p className="text-xs text-red-600 font-medium">
                    This code will not be shown again. Copy it now.
                  </p>
                  <button
                    onClick={handleCopy}
                    className="w-full px-4 py-2 rounded-lg bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-green/90 transition-colors"
                  >
                    {copied ? (
                      <><Check size={14} aria-hidden /> Copied!</>
                    ) : (
                      <><Copy size={14} aria-hidden /> Copy code</>
                    )}
                  </button>
                </div>
                <button
                  onClick={handleClose}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
                    {error}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">First name *</label>
                    <input name="firstName" type="text" required minLength={2}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/30" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Last name *</label>
                    <input name="lastName" type="text" required minLength={2}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/30" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Email address *</label>
                  <input name="email" type="email" required
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/30" />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">SA mobile number *</label>
                  <input name="phone" type="tel" required placeholder="0821234567"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/30" />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Minimum monthly amount (R) *
                  </label>
                  <input name="minimumAmount" type="number" required min={100} step={50} defaultValue={200}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/30" />
                  <p className="text-xs text-gray-400 mt-1">Minimum R100. Member must contribute at least this amount.</p>
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-4 py-2 rounded-lg bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-green/90 disabled:opacity-50 transition-colors"
                  >
                    {loading ? 'Creating...' : 'Create invite'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
