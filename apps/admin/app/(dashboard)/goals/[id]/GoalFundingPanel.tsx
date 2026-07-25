import { Reveal } from '@xxm/ui'
import { TrendingUp, Plus, Star } from 'lucide-react'
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton'

type Action = (formData: FormData) => Promise<void>

const INPUT = 'rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25'

/**
 * How an ACTIVE goal gets funded.
 *
 * The primary fund is the one common pot every monthly contribution flows into —
 * its total is derived from real money and cannot be typed in by hand, so it
 * shows an explainer instead of a form. Every other active goal can be topped up
 * manually, and can be promoted to primary.
 */
export function GoalFundingPanel({
  isPrimary, title, progressAction, primaryAction,
}: {
  isPrimary: boolean
  title: string
  progressAction: Action
  primaryAction: Action
}) {
  if (isPrimary) {
    return (
      <Reveal variant="up" delay={150} className="bg-xxm-gold/8 rounded-3xl border border-xxm-gold/25 p-6">
        <div className="flex items-center gap-2 mb-2">
          <Star size={16} className="text-xxm-gold-dark" aria-hidden />
          <h2 className="font-display text-base font-extrabold text-xxm-green-900">Primary fund</h2>
        </div>
        <p className="text-sm text-xxm-gray-600 leading-relaxed">
          This is the common fund every monthly contribution flows into. Its total fills
          automatically from members&rsquo; contributions and any extra payments directed at it,
          so it can&rsquo;t be adjusted by hand.
        </p>
      </Reveal>
    )
  }

  return (
    <Reveal variant="up" delay={150} className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-6 space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-xxm-green" aria-hidden />
          <h2 className="font-display text-base font-extrabold text-xxm-green-900">Record progress</h2>
        </div>
        <form action={progressAction} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label htmlFor="progress-amount" className="block text-xs font-semibold text-xxm-gray-700">Amount (R)</label>
            <input id="progress-amount" name="amount" type="number" min={1} step={50} required placeholder="e.g. 500" className={`${INPUT} w-36`} />
          </div>
          <div className="space-y-1.5 flex-1 min-w-[180px]">
            <label htmlFor="progress-note" className="block text-xs font-semibold text-xxm-gray-700">Note (optional)</label>
            <input id="progress-note" name="note" maxLength={200} placeholder="What was this contribution for?" className={`${INPUT} w-full`} />
          </div>
          <button type="submit" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-bold hover:bg-xxm-canopy transition-colors shadow-xxm-sm">
            <Plus size={14} aria-hidden /> Add
          </button>
        </form>
      </div>

      <div className="border-t border-xxm-gray-100 pt-5">
        <p className="text-xs text-xxm-gray-500 mb-3">
          Make this the fund every monthly contribution flows into. It will then fill
          automatically, and whichever goal is primary today loses that status.
        </p>
        <form action={primaryAction}>
          <ConfirmSubmitButton
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-xxm-gold/40 text-xxm-gold-dark text-sm font-semibold hover:bg-xxm-gold/10 transition-colors"
            title="Make this the primary fund?"
            message={`"${title}" will become the fund every monthly contribution flows into, and its total will fill automatically. Any goal currently set as primary loses that status.`}
            confirmLabel="Make primary"
          >
            <Star size={14} aria-hidden /> Make this the primary fund
          </ConfirmSubmitButton>
        </form>
      </div>
    </Reveal>
  )
}
