'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Loader2, AlertCircle } from 'lucide-react'

export type KindOption = { value: string; label: string; helper: string }

type Submitted = { reference: string; respondBy: string }

/**
 * The form a person uses to exercise a POPIA right.
 *
 * Written to be finishable by someone who is upset. The kinds are phrased as
 * things a person wants ("Delete my information") rather than as the Act's
 * vocabulary, only the four fields that are genuinely needed are asked for, and
 * nothing is required that a former member would no longer be able to supply.
 */
export function RequestForm({
  kinds,
  responseDays,
  signedInAs,
}: {
  kinds: readonly KindOption[]
  responseDays: number
  signedInAs: { name: string; email: string } | null
}) {
  const [kind, setKind] = useState(kinds[0]?.value ?? '')
  const [name, setName] = useState(signedInAs?.name ?? '')
  const [email, setEmail] = useState(signedInAs?.email ?? '')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<Submitted | null>(null)

  const helper = kinds.find((k) => k.value === kind)?.helper ?? ''

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/data-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requesterName: name, requesterEmail: email, kind, detail }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error?.message ?? 'Your request could not be submitted. Please try again.')
        return
      }
      setDone(json.data as Submitted)
    } catch {
      setError('Your request could not be submitted. Please check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  // The receipt matters as much as the form. A person who has just asked to be
  // deleted has no way to see into the Foundation, so they are given the same
  // reference and the same date the administrators are now working to.
  if (done) {
    return (
      <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm p-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-xxm-green-50 mb-5">
          <CheckCircle2 size={26} className="text-xxm-green" aria-hidden />
        </div>
        <h2 className="font-black text-xxm-green-900 text-lg">Your request has been recorded</h2>
        <p className="text-sm text-xxm-gray-600 leading-relaxed mt-3 max-w-md mx-auto">
          It was recorded the moment you pressed the button, and the Foundation has{' '}
          {responseDays} days to answer it.
        </p>
        <dl className="mt-6 inline-grid grid-cols-[auto_auto] gap-x-6 gap-y-2 text-sm text-left">
          <dt className="text-xxm-gray-400">Reference</dt>
          <dd className="font-mono text-xxm-green-900 break-all">{done.reference}</dd>
          <dt className="text-xxm-gray-400">Answer due by</dt>
          <dd className="font-semibold text-xxm-green-900 tabular-nums">{done.respondBy}</dd>
        </dl>
        <p className="text-xs text-xxm-gray-400 mt-6 max-w-md mx-auto leading-relaxed">
          Keep the reference. Before anything is disclosed or deleted the Foundation must confirm
          who you are, so you may be asked to verify your identity first. If you are not satisfied
          with the response you may complain to the Information Regulator of South Africa.
        </p>
        <Link
          href="/privacy"
          className="inline-block mt-6 text-sm font-semibold text-xxm-green hover:text-xxm-canopy underline"
        >
          Back to the Privacy Policy
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm p-6 sm:p-8 space-y-6">
      <fieldset disabled={busy} className="space-y-6 disabled:opacity-60">
        <div>
          <label htmlFor="dsr-kind" className="block text-sm font-semibold text-xxm-green-900 mb-2">
            What are you asking for?
          </label>
          <select
            id="dsr-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="w-full rounded-xl border border-xxm-gray-200 px-3.5 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
          >
            {kinds.map((k) => (
              <option key={k.value} value={k.value}>{k.label}</option>
            ))}
          </select>
          {helper && <p className="text-xs text-xxm-gray-400 mt-2">{helper}</p>}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="dsr-name" className="block text-sm font-semibold text-xxm-green-900 mb-2">
              Your name
            </label>
            <input
              id="dsr-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className="w-full rounded-xl border border-xxm-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
            />
          </div>
          <div>
            <label htmlFor="dsr-email" className="block text-sm font-semibold text-xxm-green-900 mb-2">
              Email for our reply
            </label>
            <input
              id="dsr-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-xl border border-xxm-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
            />
          </div>
        </div>

        <div>
          <label htmlFor="dsr-detail" className="block text-sm font-semibold text-xxm-green-900 mb-2">
            Tell us what you need
          </label>
          <textarea
            id="dsr-detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            required
            rows={5}
            maxLength={4000}
            placeholder="In your own words. If you are asking us to correct something, tell us what it should say."
            className="w-full rounded-xl border border-xxm-gray-200 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25 resize-y"
          />
          <p className="text-xs text-xxm-gray-400 mt-2">
            Please do not include your ID number, bank details, or password here — we already hold
            what we need, and this message is read by more than one administrator.
          </p>
        </div>

        {error && (
          <div role="alert" className="flex gap-3 rounded-xl bg-red-50 border border-red-200 p-4">
            <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" aria-hidden />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <button
          type="submit"
          className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-xxm-green px-5 py-3 text-white text-sm font-semibold hover:bg-xxm-canopy transition-colors disabled:cursor-not-allowed"
        >
          {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
          {busy ? 'Recording your request…' : 'Submit request'}
        </button>
      </fieldset>
    </form>
  )
}
