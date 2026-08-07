'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lightbulb, Send } from 'lucide-react'
import { api, ApiClientError } from '@/lib/api'
import { MONTHS } from '@/lib/date'

/**
 * Step 1 of the guide's six-step Goal flow: "A member proposes it — with a
 * clear purpose and an amount."
 *
 * A proposal is not a Goal. It is created as a DRAFT for leadership to review,
 * and the copy here says so plainly rather than implying the member has just
 * started something the circle will fund.
 */
export function ProposeGoalForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const now = new Date()
  const yearOpts = [now.getFullYear(), now.getFullYear() + 1, now.getFullYear() + 2]

  async function submit(formData: FormData) {
    setBusy(true)
    setError('')

    const month = String(formData.get('month') ?? '')
    const year = String(formData.get('year') ?? '')

    try {
      await api.post('/api/v1/goals/propose', {
        title: String(formData.get('title') ?? '').trim(),
        description: String(formData.get('description') ?? '').trim() || undefined,
        type: String(formData.get('type') ?? 'CUSTOM'),
        targetAmount: Number(formData.get('targetAmount')),
        deadline: `${year}-${month.padStart(2, '0')}-01`,
      })
      setDone(true)
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Your proposal could not be sent. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-3xl border border-xxm-green/20 bg-xxm-green-50/60 p-5 flex items-start gap-3.5">
        <Lightbulb size={18} className="text-xxm-green shrink-0 mt-0.5" aria-hidden />
        <div className="text-sm text-xxm-gray-600 leading-relaxed">
          <p className="font-bold text-xxm-green-900 mb-1">Your proposal is with leadership</p>
          <p>
            They will review it for feasibility and for genuine benefit to the circle. You will be
            told either way — including the reason, if it is not taken forward.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full px-5 py-4 flex items-center justify-between gap-3 text-left hover:bg-xxm-green-50/40 transition-colors"
      >
        <span className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-xxm-gold/15 flex items-center justify-center shrink-0">
            <Lightbulb size={16} className="text-xxm-gold-dark" aria-hidden />
          </span>
          <span>
            <span className="block text-sm font-bold text-xxm-green-900">Propose a Goal</span>
            <span className="block text-[11px] text-xxm-gray-400 mt-0.5">
              Something the circle should save toward — leadership reviews every proposal
            </span>
          </span>
        </span>
        <span className="text-xs font-semibold text-xxm-green shrink-0">{open ? 'Close' : 'Open'}</span>
      </button>

      {open && (
        <form action={submit} className="px-5 pb-5 pt-1 border-t border-xxm-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="pg-title" className="block text-xs font-semibold text-xxm-gray-700">
              What is it for? *
            </label>
            <input
              id="pg-title" name="title" required minLength={3} maxLength={120}
              placeholder="e.g. Equipment for a family catering business"
              className="w-full rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="pg-description" className="block text-xs font-semibold text-xxm-gray-700">
              Why does it matter to the circle?
            </label>
            <textarea
              id="pg-description" name="description" maxLength={500} rows={3}
              placeholder="A clear purpose helps leadership review it fairly."
              className="w-full rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pg-amount" className="block text-xs font-semibold text-xxm-gray-700">
              Amount needed (R) *
            </label>
            <input
              id="pg-amount" name="targetAmount" type="number" required min={1} step="1"
              placeholder="15000"
              className="w-full rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="pg-type" className="block text-xs font-semibold text-xxm-gray-700">Kind of goal *</label>
            <select
              id="pg-type" name="type" required defaultValue="CUSTOM"
              className="w-full rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
            >
              <option value="CUSTOM">One-off</option>
              <option value="MONTHLY">Monthly</option>
              <option value="YEARLY">Yearly</option>
            </select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <span className="block text-xs font-semibold text-xxm-gray-700">Needed by *</span>
            <div className="flex gap-2">
              <select
                name="month" required aria-label="Deadline month"
                className="flex-1 rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
              >
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select
                name="year" required aria-label="Deadline year"
                className="w-28 rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
              >
                {yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {error && (
            <p role="alert" className="sm:col-span-2 text-sm text-red-600 font-medium">
              {error}
            </p>
          )}

          <div className="sm:col-span-2 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] text-xxm-gray-400 max-w-sm">
              This creates a proposal, not a Goal. Leadership reviews it for feasibility and for
              genuine benefit to the circle, and you are told either way.
            </p>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-xxm-green text-white text-sm font-bold hover:bg-xxm-canopy transition-colors disabled:opacity-60 disabled:cursor-not-allowed shrink-0"
            >
              <Send size={14} aria-hidden />
              {busy ? 'Sending…' : 'Send for review'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
