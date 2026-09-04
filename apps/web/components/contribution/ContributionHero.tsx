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
 * ── The drifting orbs, and why they are safe here ──────────────────────────
 *
 * These are the dashboard hero's three `animate-orb-drift-*` lights: slow
 * 14–22s translate-and-scale loops that give the panel depth without ever
 * asking for attention.
 *
 * An infinite transform animation was the one thing this page could not
 * afford to get wrong, so it is worth being precise about why this shape is
 * fine when the shell's was not.
 *
 * The bug was an **ancestor** transform: `<main>` moved, and the count-up
 * repainted *inside* the layer that was moving, so Blink kept rasterising
 * tiles it never invalidated. Every orb here is an absolutely positioned
 * **sibling** of the content — it sits beside the number, not around it.
 * Its transform moves its own layer and nothing else's, and the counting
 * total is never a descendant of anything that animates.
 *
 * `will-change: transform` makes that promotion explicit rather than leaving
 * it to Blink's heuristics, so an orb can never be rasterised into the same
 * layer as the text it drifts behind.
 *
 * `motion.ts` states the rule this follows, and
 * `contributions-motion-policy.test.ts` enforces the shape: an infinite
 * animation on this page must be `absolute`, `aria-hidden` and
 * `will-change`-promoted — decorative, out of flow, and never a wrapper.
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

      {/* Drifting light, as on the dashboard. Absolute siblings of the
          content, promoted to their own layers — see the note above. */}
      <div
        className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/[0.07] animate-orb-drift-1"
        style={{ willChange: 'transform' }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-12 h-56 w-56 rounded-full bg-xxm-gold/10 animate-orb-drift-2"
        style={{ willChange: 'transform' }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-16 right-1/4 h-40 w-40 rounded-full bg-white/[0.04] animate-orb-drift-3"
        style={{ willChange: 'transform' }}
        aria-hidden
      />

      <div className="relative z-10 px-5 py-6 sm:px-8 sm:py-8">
        <span className="glass-gold inline-flex items-center gap-2 rounded-full px-3 py-1.5">
          <TrendingUp size={12} className="text-xxm-gold" aria-hidden />
          <span className="text-[10px] font-bold uppercase tracking-widest text-xxm-gold sm:text-[11px]">
            Monthly contributions
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
