'use client'

import { useCountUp } from '@/lib/hooks/useCountUp'
import { formatZAR } from '@/lib/formatters'
import { TrendingUp } from 'lucide-react'

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
 * The headline panel, in the dashboard hero's language.
 *
 * Same construction as the greeting card on `/dashboard`: a `to-br` green
 * gradient at `rounded-3xl` under `shadow-xxm-lg`, a noise overlay, a
 * `glass-gold` eyebrow pill and display type. It should read as the same
 * product, because it is.
 *
 * ── One difference from the dashboard hero, and it is deliberate ────────────
 *
 * The dashboard's hero carries three orbs on infinite `animate-orb-drift-*`
 * transforms. They are safe there because the count-ups live in a *sibling*
 * section — nothing that repaints sits inside a perpetually moving box.
 *
 * Here the counting total is the hero, so drifting orbs would put a 60fps
 * repaint inside a permanently animating layer: the exact arrangement that
 * tore this page for seven rounds. The washes below are static radial
 * gradients instead. They give the same depth and light, cost one paint, and
 * remove the only structure on this page capable of bringing the bug back.
 *
 * See `motion.ts` for the full policy.
 */
export function ContributionHero({ summary }: { summary: Summary }) {
  // Counted in cents so the decimals animate rather than snapping on at the end.
  const total = useCountUp(Math.round(summary.totalPaid * 100), 900)
  const year = useCountUp(Math.round(summary.yearlyPaid * 100), 900)
  const currentYear = new Date().getFullYear()

  const progress =
    summary.totalContributions > 0
      ? Math.min(100, Math.round((summary.paid / summary.totalContributions) * 100))
      : 0

  return (
    <section
      aria-label="Contribution totals"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-xxm-green via-xxm-canopy to-xxm-green-900 text-white shadow-xxm-lg"
    >
      <div className="noise-overlay" aria-hidden />

      {/* Static light. Radial washes, not drifting orbs — see the note above. */}
      <div
        className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.10),transparent_70%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.14),transparent_70%)]"
        aria-hidden
      />

      <div className="relative z-10 px-5 py-6 sm:px-8 sm:py-8">
        <span className="glass-gold inline-flex items-center gap-2 rounded-full px-3 py-1.5">
          <TrendingUp size={12} className="text-xxm-gold" aria-hidden />
          <span className="text-[10px] font-bold uppercase tracking-widest text-xxm-gold sm:text-[11px]">
            Total contributed
          </span>
        </span>

        {/* `break-words`, not `truncate`: this is the member's own money and
            clipping it silently is worse than letting it wrap. */}
        <p className="stat-number mt-3.5 break-words font-display text-4xl font-black leading-none tracking-tight sm:text-5xl">
          {formatZAR(total / 100)}
        </p>

        <div className="mt-6 max-w-md sm:mt-7">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-widest text-white/50">
              {currentYear} so far
            </span>
            <span className="stat-number text-sm font-extrabold text-xxm-gold">
              {formatZAR(year / 100)}
            </span>
          </div>
          <span
            className="mt-2.5 block h-1.5 w-full overflow-hidden rounded-full bg-white/12"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Periods fully paid"
          >
            {/* `transition-[width]` on a leaf that contains nothing. */}
            <span
              className="block h-full rounded-full bg-gradient-to-r from-xxm-gold-dark via-xxm-gold to-xxm-gold-light transition-[width] duration-700 ease-smooth"
              style={{ width: `${progress}%` }}
            />
          </span>
          <p className="mt-2.5 text-[11px] leading-relaxed text-white/50">
            {summary.paid} of {summary.totalContributions}{' '}
            {summary.totalContributions === 1 ? 'period' : 'periods'} fully paid
            {summary.partial > 0 && ` · ${summary.partial} part-paid`}
          </p>
        </div>
      </div>
    </section>
  )
}
