'use client'

import { useState } from 'react'
import { HandCoins, Zap } from 'lucide-react'
import { GoalPayModal } from './GoalPayModal'

interface Props {
  goalId: string
  goalTitle: string
  remaining: number
}

/**
 * The call to action that turns a goal from something members watch into
 * something they can move. A pledge is a promise; this collects real money
 * through the member's debit order, on top of their monthly contribution.
 */
export function GoalPayCard({ goalId, goalTitle, remaining }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div className="relative overflow-hidden bg-gradient-to-br from-xxm-green to-xxm-canopy rounded-3xl shadow-xxm p-5">
        <div className="pointer-events-none absolute -top-10 -right-10 w-40 h-40 rounded-full bg-xxm-gold/20 blur-2xl" aria-hidden />
        <div className="relative flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/15 ring-1 ring-white/25 flex items-center justify-center shrink-0">
            <Zap size={19} className="text-xxm-gold" aria-hidden />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-display text-lg font-black text-white leading-tight">Chip in extra</p>
            <p className="text-xs text-white/70 mt-1 leading-relaxed">
              Pay any amount straight into this goal — over and above your monthly
              contribution. It lands immediately and boosts your badge points.
            </p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-xxm-gold text-xxm-green-900 text-sm font-bold hover:bg-xxm-gold-light hover:-translate-y-0.5 transition-all duration-fast ease-smooth shadow-gold-sm"
            >
              <HandCoins size={15} aria-hidden /> Contribute now
            </button>
          </div>
        </div>
      </div>

      {open && (
        <GoalPayModal
          goalId={goalId}
          goalTitle={goalTitle}
          remaining={remaining}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
