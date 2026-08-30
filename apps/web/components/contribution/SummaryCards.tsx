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
 * Rebuilt mobile-first, 2026-08-30, after three earlier attempts at the
 * "scratching"/tearing this component showed on phones.
 *
 * ── What was actually wrong ─────────────────────────────────────────────────
 *
 * These cards sit inside a `<Reveal>`, which animates `transform` on their
 * shared parent. Each card ALSO declared `transition-all` alongside
 * `hover:-translate-y-0.5`.
 *
 * `transition-all` does not mean "the hover effect" — it means every animatable
 * property on this element, `transform` included. So during the reveal the
 * parent's transform is settling while each child has its own live transform
 * transition armed on the same frame. Four of them, in a grid, each compositing
 * independently. On a phone (no hover to justify it, slower paint, and the
 * reveal firing on load rather than after a deliberate scroll) that reads as a
 * tear or shimmer across the group — the exact symptom reported, and the reason
 * fixes aimed at `Reveal` alone kept not landing.
 *
 * The fix is not to remove the polish, it is to be precise about what animates:
 *
 *   - `transition-[box-shadow,border-color]` instead of `transition-all`, so a
 *     card never animates `transform` on its own while an ancestor is animating
 *     one for it.
 *   - the lift is `sm:hover:` only. Hover does not exist on touch; on mobile it
 *     was pure cost — a compositing layer per card for an effect nobody can
 *     trigger.
 *   - no `group-hover` scale on the icon below `sm:` either, for the same
 *     reason.
 *
 * ── Mobile-first sizing ─────────────────────────────────────────────────────
 *
 * Base styles target the narrow viewport and widen at `sm:`/`lg:`, rather than
 * desktop values being walked back down. `min-w-0` on each cell is load-bearing
 * in a grid: a cell's default min-width is its content's min-content size, so a
 * long unbreakable value like "R 123 456,78" would otherwise force its track
 * wider than a 2-up row can hold and push the whole grid past the viewport.
 */
export function ContributionSummaryCards({ summary }: { summary: Summary }) {
  const currentYear = new Date().getFullYear()

  const cards: {
    icon: LucideIcon
    label: string
    value: string
    sub?: string
    gradient: string
    iconBg: string
    iconColor: string
    border: string
    valueColor?: string
  }[] = [
    {
      icon: TrendingUp,
      label: 'Total contributed',
      value: formatZAR(summary.totalPaid),
      gradient: 'from-xxm-green-50 to-white',
      iconBg: 'bg-xxm-green/10',
      iconColor: 'text-xxm-green',
      border: 'border-xxm-green/15',
    },
    {
      icon: Calendar,
      label: `${currentYear} total`,
      value: formatZAR(summary.yearlyPaid),
      gradient: 'from-amber-50 to-white',
      iconBg: 'bg-xxm-gold/15',
      iconColor: 'text-xxm-gold-dark',
      border: 'border-xxm-gold/20',
    },
    {
      icon: CheckCircle2,
      label: 'Paid periods',
      value: `${summary.paid} / ${summary.totalContributions}`,
      sub: summary.partial > 0 ? `${summary.partial} partial` : undefined,
      gradient: 'from-emerald-50 to-white',
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      border: 'border-emerald-200',
    },
    {
      icon: AlertTriangle,
      label: 'Overdue',
      value: summary.overdue.toString(),
      sub: summary.overdue > 0 ? 'Action required' : 'All clear!',
      gradient: summary.overdue > 0 ? 'from-red-50 to-white' : 'from-xxm-green-50 to-white',
      iconBg: summary.overdue > 0 ? 'bg-red-100' : 'bg-xxm-green-100',
      iconColor: summary.overdue > 0 ? 'text-red-500' : 'text-xxm-green-600',
      border: summary.overdue > 0 ? 'border-red-200' : 'border-xxm-green/15',
      valueColor: summary.overdue > 0 ? 'text-red-600' : 'text-xxm-green-700',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {cards.map(({ icon: Icon, label, value, sub, gradient, iconBg, iconColor, border, valueColor }) => (
        <div
          key={label}
          className={[
            'group relative min-w-0 overflow-hidden rounded-2xl border',
            'bg-gradient-to-b',
            gradient,
            border,
            'p-4 sm:p-5',
            'shadow-xxm-sm',
            // Only these two properties animate. Never `transform` — see the
            // component note above.
            'transition-[box-shadow,border-color] duration-fast ease-smooth',
            'sm:hover:shadow-xxm sm:hover:border-xxm-green/25',
          ].join(' ')}
        >
          <div
            className={[
              'flex h-9 w-9 items-center justify-center rounded-xl sm:h-10 sm:w-10',
              iconBg,
              'mb-3 sm:mb-4',
              'transition-transform duration-slow sm:group-hover:scale-110',
            ].join(' ')}
          >
            <Icon size={16} className={`${iconColor} sm:hidden`} aria-hidden />
            <Icon size={18} className={`${iconColor} hidden sm:block`} aria-hidden />
          </div>

          {/*
            `break-words` rather than `truncate`: a member's own total is the
            one number on this page they are most likely to check, and a
            silently clipped amount is worse than a wrapped one.
          */}
          <p
            className={`stat-number text-lg leading-tight font-extrabold break-words sm:text-2xl ${
              valueColor ?? 'text-xxm-green-900'
            }`}
          >
            {value}
          </p>
          <p className="mt-1.5 text-[11px] font-semibold text-xxm-gray-600 sm:text-xs">{label}</p>
          {sub && <p className="mt-0.5 text-[10px] text-xxm-gray-400 sm:text-[11px]">{sub}</p>}
        </div>
      ))}
    </div>
  )
}
