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
 * The four headline figures, as one grouped panel.
 *
 * ── Rebuilt from scratch, 2026-08-30 ────────────────────────────────────────
 *
 * This replaces four separately-elevated cards — each with its own gradient
 * background, rounded clip, shadow and hover transition — after six attempts
 * to stop this page tearing on phones failed one after another. Screenshots
 * showed cards painted twice about 100px apart and whole bands of the page
 * rendering at a previous scroll offset, which is a compositor failing to
 * invalidate rather than anything about layout.
 *
 * Rather than guess at which of those properties was responsible for a seventh
 * time, this is built to give the compositor as little to do as possible:
 *
 *   - **One box, not four.** A single bordered container with hairline-divided
 *     cells inside, so the browser has one rounded, clipped element on this
 *     section instead of four.
 *   - **Opaque backgrounds.** Flat `bg-white` on every cell rather than
 *     gradients over a translucent tint. A non-opaque box has to be blended
 *     against what is behind it on every paint; an opaque one can be drawn
 *     once and reused.
 *   - **No shadows, no hover, no transitions below `sm:`.** There is no
 *     pointer on a phone to trigger a hover state, so every one of those was
 *     cost with no benefit on the device that was breaking.
 *
 * The dividers come from `gap-px` over a grey container rather than per-cell
 * borders: the gap lets the container's colour show through as a hairline, so
 * the lines cost nothing extra to paint and cannot double up where cells meet.
 *
 * If tearing survives this, the cause is not on this page — it is in the app
 * shell, and that is worth knowing too.
 */
export function ContributionSummary({ summary }: { summary: Summary }) {
  const currentYear = new Date().getFullYear()
  const hasOverdue = summary.overdue > 0

  const cells: {
    icon: LucideIcon
    label: string
    value: string
    sub?: string
    iconClass: string
    valueClass: string
  }[] = [
    {
      icon: TrendingUp,
      label: 'Total contributed',
      value: formatZAR(summary.totalPaid),
      iconClass: 'text-xxm-green',
      valueClass: 'text-xxm-green-900',
    },
    {
      icon: Calendar,
      label: `${currentYear} total`,
      value: formatZAR(summary.yearlyPaid),
      iconClass: 'text-xxm-gold-dark',
      valueClass: 'text-xxm-green-900',
    },
    {
      icon: CheckCircle2,
      label: 'Paid periods',
      value: `${summary.paid} / ${summary.totalContributions}`,
      sub: summary.partial > 0 ? `${summary.partial} partial` : undefined,
      iconClass: 'text-emerald-600',
      valueClass: 'text-xxm-green-900',
    },
    {
      icon: AlertTriangle,
      label: 'Overdue',
      value: String(summary.overdue),
      sub: hasOverdue ? 'Action required' : 'All clear',
      iconClass: hasOverdue ? 'text-red-500' : 'text-xxm-green-600',
      valueClass: hasOverdue ? 'text-red-600' : 'text-xxm-green-900',
    },
  ]

  return (
    <section aria-label="Contribution summary">
      {/* The grey container is the divider colour; `gap-px` reveals it. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-xxm-green/10 bg-xxm-gray-100 lg:grid-cols-4">
        {cells.map(({ icon: Icon, label, value, sub, iconClass, valueClass }) => (
          // `min-w-0` is load-bearing in a grid: a cell's default minimum width
          // is its content's, so an amount like "R 123 456,78" would push its
          // track wider than half a 360px screen and take the page with it.
          <div key={label} className="min-w-0 bg-white p-4 sm:p-5">
            <Icon size={16} className={`${iconClass} mb-2.5 sm:mb-3`} aria-hidden />
            {/* `break-words`, not `truncate`: a member's own total is the number
                they came to this page to read, and silently clipping it is
                worse than wrapping it. */}
            <p className={`stat-number break-words text-lg font-extrabold leading-tight sm:text-2xl ${valueClass}`}>
              {value}
            </p>
            <p className="mt-1.5 text-[11px] font-semibold text-xxm-gray-600 sm:text-xs">{label}</p>
            {sub && <p className="mt-0.5 text-[10px] text-xxm-gray-400 sm:text-[11px]">{sub}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}
