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
 * ── Why one panel and not four cards ────────────────────────────────────────
 *
 * This page tore on phones for six rounds of attempted fixes: cards painted
 * twice about 100px apart, bands of the page rendering at a previous scroll
 * offset, worse the further you scrolled. That is a compositor failing to
 * invalidate, and what finally fixed it was reducing how many separately
 * clipped, elevated boxes the page asks the phone to draw — not removing any
 * single CSS property.
 *
 * So the structure is load-bearing and must not be "tidied" back into four
 * free-standing cards: one bordered container, hairline-divided cells inside,
 * opaque backgrounds. The dividers come from `gap-px` over a grey container
 * rather than per-cell borders, so the lines cost nothing extra to paint and
 * cannot double where cells meet.
 *
 * The styling is the system's — `rounded-3xl`, `shadow-xxm`, the gradient icon
 * tile with its hairline ring — applied to the panel rather than to each cell.
 * The transactions page carries exactly this treatment on a single card and
 * has never shown the problem; twelve of them is what did.
 */
export function ContributionSummary({ summary }: { summary: Summary }) {
  const currentYear = new Date().getFullYear()
  const hasOverdue = summary.overdue > 0

  const cells: {
    icon: LucideIcon
    label: string
    value: string
    sub?: string
    tile: string
    iconColor: string
    valueColor: string
  }[] = [
    {
      icon: TrendingUp,
      label: 'Total contributed',
      value: formatZAR(summary.totalPaid),
      tile: 'bg-gradient-to-br from-xxm-green/15 to-xxm-green/5 ring-xxm-green/10',
      iconColor: 'text-xxm-green',
      valueColor: 'text-xxm-green-900',
    },
    {
      icon: Calendar,
      label: `${currentYear} total`,
      value: formatZAR(summary.yearlyPaid),
      tile: 'bg-gradient-to-br from-xxm-gold/20 to-xxm-gold/5 ring-xxm-gold/20',
      iconColor: 'text-xxm-gold-dark',
      valueColor: 'text-xxm-green-900',
    },
    {
      icon: CheckCircle2,
      label: 'Paid periods',
      value: `${summary.paid} / ${summary.totalContributions}`,
      sub: summary.partial > 0 ? `${summary.partial} partial` : undefined,
      tile: 'bg-gradient-to-br from-emerald-200/50 to-emerald-100/20 ring-emerald-200',
      iconColor: 'text-emerald-600',
      valueColor: 'text-xxm-green-900',
    },
    {
      icon: AlertTriangle,
      label: 'Overdue',
      value: String(summary.overdue),
      sub: hasOverdue ? 'Action required' : 'All clear',
      tile: hasOverdue
        ? 'bg-gradient-to-br from-red-200/60 to-red-100/20 ring-red-200'
        : 'bg-gradient-to-br from-xxm-green/15 to-xxm-green/5 ring-xxm-green/10',
      iconColor: hasOverdue ? 'text-red-500' : 'text-xxm-green-600',
      valueColor: hasOverdue ? 'text-red-600' : 'text-xxm-green-900',
    },
  ]

  return (
    <section aria-label="Contribution summary">
      {/* The grey container is the divider colour; `gap-px` reveals it. */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-xxm-green/8 bg-xxm-gray-100 shadow-xxm-sm sm:shadow-xxm lg:grid-cols-4">
        {cells.map(({ icon: Icon, label, value, sub, tile, iconColor, valueColor }) => (
          // `min-w-0` is load-bearing in a grid: a cell's default minimum width
          // is its content's, so an amount like "R 123 456,78" would push its
          // track wider than half a 360px screen and take the page with it.
          <div key={label} className="min-w-0 bg-white p-4 sm:p-5">
            <span
              className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ring-1 sm:h-10 sm:w-10 ${tile}`}
              aria-hidden
            >
              <Icon size={16} className={iconColor} />
            </span>
            {/* `break-words`, not `truncate`: a member's own total is the number
                they came to this page to read, and silently clipping it is
                worse than wrapping it. */}
            <p className={`stat-number break-words text-lg font-extrabold leading-tight sm:text-2xl ${valueColor}`}>
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
