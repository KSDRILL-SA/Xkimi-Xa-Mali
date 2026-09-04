'use client'

import { useCountUp } from '@/lib/hooks/useCountUp'
import { formatZAR } from '@/lib/formatters'
import { TrendingUp, Calendar, CheckCircle2, AlertTriangle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type Summary = {
  totalPaid: number
  yearlyPaid: number
  paid: number
  partial: number
  pending: number
  overdue: number
  totalContributions: number
}

/**
 * The four headline figures, at the same level as the dashboard's stat cards —
 * gradient fill, coloured border, hover lift and the count-up animation — while
 * keeping the structure that stopped this page tearing on phones.
 *
 * ── What actually caused the tearing, and why these are cards again ─────────
 *
 * It was never a single CSS property. It was the *number* of separately
 * clipped, elevated boxes the page asked the phone's GPU to composite: four
 * floating summary cards **plus twelve elevated history rows**. Sixteen.
 * Collapsing both into grouped panels is what fixed it, confirmed on a real
 * device after six failed attempts.
 *
 * The history list is now permanently one card of divided rows — that is the
 * change that actually bought the headroom, and it is the one that must not be
 * undone. With it in place the page carries roughly seven composited boxes:
 * four stat cards, the ledger, the group account, the mandate notice.
 *
 * That is the same budget as the dashboard, which renders its own gradient,
 * shadowed stat cards plus a badge, insights and recent-contributions card and
 * does not tear on the same phone. So these are real cards at every size,
 * matching it.
 *
 * ── If tearing ever returns ─────────────────────────────────────────────────
 *
 * Look here first, and count boxes before changing properties. Re-grouping
 * these four cells into one container — `gap-px` over a grey background, with
 * the border, clip and shadow moved to the container — is a small, known-good
 * change that restores the fixed layout. What must **not** happen is the
 * history list going back to a card per row.
 *
 * The hover lift stays `sm:`-only: a per-box transform is the expensive kind,
 * and no phone can trigger a hover state to justify it.
 */
export function ContributionSummary({ summary }: { summary: Summary }) {
  const currentYear = new Date().getFullYear()
  const hasOverdue = summary.overdue > 0

  return (
    <section aria-label="Contribution summary">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCell
          icon={TrendingUp}
          label="Total contributed"
          value={summary.totalPaid}
          currency
          gradient="from-xxm-green-50"
          border="border-xxm-green/15"
          iconBg="bg-xxm-green/10"
          iconColor="text-xxm-green"
        />
        <StatCell
          icon={Calendar}
          label={`${currentYear} total`}
          value={summary.yearlyPaid}
          currency
          gradient="from-amber-50"
          border="border-xxm-gold/20"
          iconBg="bg-xxm-gold/15"
          iconColor="text-xxm-gold-dark"
        />
        <StatCell
          icon={CheckCircle2}
          label="Paid periods"
          value={summary.paid}
          outOf={summary.totalContributions}
          sub={summary.partial > 0 ? `${summary.partial} partial` : undefined}
          gradient="from-emerald-50"
          border="border-emerald-200"
          iconBg="bg-emerald-100"
          iconColor="text-emerald-600"
        />
        <StatCell
          icon={AlertTriangle}
          label="Overdue"
          value={summary.overdue}
          sub={hasOverdue ? 'Action required' : 'All clear'}
          gradient={hasOverdue ? 'from-red-50' : 'from-xxm-green-50'}
          border={hasOverdue ? 'border-red-200' : 'border-xxm-green/15'}
          iconBg={hasOverdue ? 'bg-red-100' : 'bg-xxm-green-100'}
          iconColor={hasOverdue ? 'text-red-500' : 'text-xxm-green-600'}
          valueColor={hasOverdue ? 'text-red-600' : undefined}
        />
      </div>
    </section>
  )
}

function StatCell({
  icon: Icon,
  label,
  value,
  outOf,
  sub,
  currency = false,
  gradient,
  border,
  iconBg,
  iconColor,
  valueColor,
}: {
  icon: LucideIcon
  label: string
  value: number
  outOf?: number
  sub?: string
  currency?: boolean
  gradient: string
  border: string
  iconBg: string
  iconColor: string
  valueColor?: string
}) {
  // Currency counts up in cents so the decimals animate rather than snapping
  // on at the end.
  const target = currency ? Math.round(value * 100) : value
  const count = useCountUp(target, 900)
  const display = currency ? formatZAR(count / 100) : count.toLocaleString('en-ZA')

  return (
    <div
      className={[
        'group min-w-0 rounded-2xl border bg-gradient-to-b to-white p-4 shadow-xxm-sm sm:p-5',
        gradient,
        border,
        // The lift is `sm:` only. A per-box transform is the expensive kind of
        // compositing, and there is no hover on a touch screen to trigger it —
        // so on a phone it would be cost with nothing to show for it.
        'sm:transition-[box-shadow,transform] sm:duration-fast sm:ease-smooth',
        'sm:hover:-translate-y-0.5 sm:hover:shadow-xxm',
      ].join(' ')}
    >
      <span
        className={[
          'mb-3 flex h-9 w-9 items-center justify-center rounded-xl sm:mb-4 sm:h-10 sm:w-10',
          iconBg,
          // `sm:` on the TRANSITION, not just the hover that triggers it.
          // An armed transform transition makes an element a compositing
          // candidate in Blink even at rest and even if nothing ever hovers
          // it. Four of these ride the summary and twelve more ride the
          // history rows — and the one card on this page with no such icon,
          // Group Collection Account, is the one card that never ghosted.
          // Earlier rounds gated this on the card and missed the children.
          'sm:transition-transform sm:duration-slow sm:group-hover:scale-110',
        ].join(' ')}
        aria-hidden
      >
        <Icon size={16} className={iconColor} />
      </span>

      {/* `break-words`, not `truncate`: a member's own total is the number they
          came to this page to read, and silently clipping it is worse than
          wrapping it. */}
      <p
        className={`stat-number break-words text-lg font-extrabold leading-tight sm:text-2xl ${
          valueColor ?? 'text-xxm-green-900'
        }`}
      >
        {display}
        {outOf !== undefined && (
          <span className="text-xxm-gray-400"> / {outOf}</span>
        )}
      </p>
      <p className="mt-1.5 text-[11px] font-semibold text-xxm-gray-600 sm:text-xs">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] text-xxm-gray-400 sm:text-[11px]">{sub}</p>}
    </div>
  )
}
