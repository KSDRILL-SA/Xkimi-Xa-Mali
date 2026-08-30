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
 * ── One panel on mobile, four cards on desktop ──────────────────────────────
 *
 * The tearing was never caused by any single CSS property. It was the number of
 * separately clipped, elevated boxes the page asked the phone's GPU to
 * composite: four floating summary cards plus twelve elevated history rows.
 * Collapsing both into grouped panels is what fixed it, confirmed on a real
 * device after six failed attempts.
 *
 * Desktop never had the problem, so the split is by breakpoint rather than a
 * compromise on either side:
 *
 *   - **Base (mobile):** one clipped, bordered container; the cells are flat
 *     panes separated by a hairline, which `gap-px` produces by letting the
 *     container's grey show through. One box to clip and elevate, not four.
 *     At 360px this is also simply the better layout — four floating cards with
 *     gaps and shadows leave each about 150px of usable width.
 *   - **`sm:` and up:** the container gives up its border, background, clip and
 *     shadow, and each cell becomes a card in its own right with the dashboard's
 *     treatment. Same component, same markup, no duplicated content.
 *
 * The gradients are safe at both sizes: a gradient *fill* is cheap. What was
 * expensive was per-box rounding, clipping and shadow — which is exactly what
 * stays behind `sm:`.
 *
 * **Do not remove the base-size grouping.** It looks like an arbitrary style
 * choice and it is the fix.
 */
export function ContributionSummary({ summary }: { summary: Summary }) {
  const currentYear = new Date().getFullYear()
  const hasOverdue = summary.overdue > 0

  return (
    <section aria-label="Contribution summary">
      <div
        className={[
          // Mobile: one grouped, clipped panel. `gap-px` over the grey
          // container is what draws the dividers.
          'grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-xxm-green/8 bg-xxm-gray-100 shadow-xxm-sm',
          // Desktop: dissolve the container, let the cells stand alone.
          'sm:gap-4 sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent sm:shadow-none',
          'lg:grid-cols-4',
        ].join(' ')}
      >
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
        'group min-w-0 bg-gradient-to-b to-white p-4',
        gradient,
        // The card treatment is `sm:` only — see the note above. `-translate-y`
        // and the shadow are the two things that must not exist per-box on a
        // phone.
        'sm:rounded-2xl sm:border sm:p-5 sm:shadow-xxm-sm',
        border,
        'sm:transition-[box-shadow,transform] sm:duration-fast sm:ease-smooth',
        'sm:hover:-translate-y-0.5 sm:hover:shadow-xxm',
      ].join(' ')}
    >
      <span
        className={[
          'mb-3 flex h-9 w-9 items-center justify-center rounded-xl sm:mb-4 sm:h-10 sm:w-10',
          iconBg,
          'transition-transform duration-slow sm:group-hover:scale-110',
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
