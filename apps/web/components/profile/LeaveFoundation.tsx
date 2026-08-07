'use client'

import { useState } from 'react'
import { signOut } from 'next-auth/react'
import { DoorOpen, AlertTriangle } from 'lucide-react'
import { api, ApiClientError } from '@/lib/api'

/**
 * Leaving, as the guide describes it: available at any time, and honest about
 * what it does and does not do.
 *
 * The copy carries the whole of the promise — history stays, contributions
 * already made are not refunded, future collections stop — because a member
 * making an irreversible choice should not have to go and find that out.
 */
export function LeaveFoundation() {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function leave() {
    setBusy(true)
    setError('')
    try {
      await api.post('/api/v1/members/me/leave', { confirm })
      // Their session was issued while they were still active. Ending it here
      // means the next thing they see is a signed-out page rather than a
      // dashboard that quietly stops working.
      await signOut({ callbackUrl: '/login?reason=left' })
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'We could not complete this. Please try again, or speak to any leader.',
      )
      setBusy(false)
    }
  }

  return (
    <section className="rounded-3xl border border-red-200 bg-red-50/40 overflow-hidden">
      <div className="px-5 py-4 flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
          <DoorOpen size={18} className="text-red-600" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-red-900">Leave the Foundation</h2>
          <p className="text-xs text-red-800/80 mt-1 leading-relaxed">
            You may leave at any time. Your debit order stops immediately and no future
            collection will include you. Your contribution history stays on record, and money
            you have already contributed is not refunded.
          </p>

          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-300 bg-white text-red-700 text-sm font-semibold hover:bg-red-50 transition-colors"
            >
              <DoorOpen size={14} aria-hidden />
              I want to leave
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-red-200/70 space-y-3">
          <div className="flex items-start gap-2.5 text-xs text-red-800">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" aria-hidden />
            <p className="leading-relaxed">
              This takes effect straight away and only leadership can put you back. Your
              statements and history remain available to you.
            </p>
          </div>

          <label className="block">
            <span className="block text-[11px] font-bold text-red-900/70 uppercase tracking-widest mb-1.5">
              Type LEAVE to confirm
            </span>
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              placeholder="LEAVE"
              className="w-full max-w-xs px-3 py-2 rounded-xl border border-red-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            />
          </label>

          {error && <p role="alert" className="text-sm text-red-700 font-medium">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={leave}
              disabled={busy || confirm.trim().toUpperCase() !== 'LEAVE'}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <DoorOpen size={14} aria-hidden />
              {busy ? 'Leaving…' : 'Leave the Foundation'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setConfirm(''); setError('') }}
              disabled={busy}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-xxm-gray-600 hover:bg-white transition-colors"
            >
              Stay
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
