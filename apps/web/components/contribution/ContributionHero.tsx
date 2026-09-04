'use client'

import { useCountUp } from '@/lib/hooks/useCountUp'
import { formatZAR } from '@/lib/formatters'

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
 * ── What tore this page, after seven attempts ───────────────────────────────
 *
 * Not a card, not a shadow, not a gradient, and not `transition-transform`.
 *
 * `<main>` in the app shell carried `animate-fade-in-up` — a 400ms
 * **translateY** — on every page load. That puts the entire page content into
 * a compositing layer that is moving for the first 400ms after navigation.
 *
 * `useCountUp` runs a `requestAnimationFrame` loop calling `setState` roughly
 * sixty times a second for 900ms. On the contributions page four of those ran
 * at once, inside that moving layer. Blink rasterises the layer, the subtree
 * rewrites itself mid-transform, and the old tiles are never invalidated — so
 * the phone kept the intermediate frames on screen. That is exactly what the
 * screenshots show: "Make a payment" painted three times at three scroll
 * offsets, each copy a real frame of the entry animation.
 *
 * The correlation is complete and it is the only one that ever was:
 *
 *   contributions  uses useCountUp  tears
 *   dashboard      uses useCountUp  tears
 *   transactions   does not         never tore — with the same gradients,
 *                                   the same rounded-3xl, the same shadow-xxm
 *                                   and the same Reveal
 *
 * Which is why every previous fix failed. They removed cards, shadows, hover
 * lifts and transitions from a page whose visual twin had all of them and was
 * fine. Round six disabled the count-up and the tearing stopped — but the
 * conclusion drawn was "phones cannot afford the animation", so when the owner
 * asked for it back in round seven it returned and took the bug with it.
 *
 * The animation was never the problem. The **ancestor transform** was. The
 * shell now fades with opacity alone, so a repainting subtree has no moving
 * layer to be stranded in, and the count-up is free to run everywhere.
 *
 * ── The design ─────────────────────────────────────────────────────────────
 *
 * One number is why a member opens this page: what they have put in. It gets
 * the panel, the scale and the contrast; everything else is context sized
 * against it. The previous layout gave "Total contributed" exactly as much
 * room as "Overdue: 0", which is four figures of equal weight and therefore no
 * hierarchy at all.
 */
export function ContributionHero({ summary }: { summary: Summary }) {
  // Counted in cents so the decimals animate rather than snapping on at the end.
  const total = useCountUp(Math.round(summary.totalPaid * 100), 900)
  const year = useCountUp(Math.round(summary.yearlyPaid * 100), 900)
  const currentYear = new Date().getFullYear()

  const settled = summary.paid + summary.partial
  const progress =
    summary.totalContributions > 0
      ? Math.min(100, Math.round((summary.paid / summary.totalContributions) * 100))
      : 0

  return (
    <section
      aria-label="Contribution totals"
      className="overflow-hidden rounded-3xl bg-gradient-to-br from-xxm-canopy to-xxm-green-900 shadow-xxm"
    >
      <div className="px-5 py-6 sm:px-7 sm:py-7">
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">
          Total contributed
        </p>
        {/* `break-words`, not `truncate`: this is the member's own money and
            clipping it silently is worse than letting it wrap. */}
        <p className="stat-number mt-1.5 break-words font-display text-4xl font-black leading-none tracking-tight text-white sm:text-5xl">
          {formatZAR(total / 100)}
        </p>

        {/* The year's progress, as a single line rather than a card. */}
        <div className="mt-5 sm:mt-6">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-white/50">
              {currentYear}
            </span>
            <span className="stat-number text-sm font-bold text-xxm-gold">
              {formatZAR(year / 100)}
            </span>
          </div>
          <span
            className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-white/12"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Periods settled"
          >
            <span
              className="block h-full rounded-full bg-xxm-gold transition-[width] duration-700 ease-smooth"
              style={{ width: `${progress}%` }}
            />
          </span>
          <p className="mt-2 text-[11px] text-white/45">
            {summary.paid} of {summary.totalContributions}{' '}
            {summary.totalContributions === 1 ? 'period' : 'periods'} fully paid
            {summary.partial > 0 && ` · ${summary.partial} part-paid`}
          </p>
        </div>
      </div>

      {/* A hairline strip of counts, inside the same box. Three figures that
          are context for the headline, not competitors to it. */}
      <dl className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10">
        <HeroStat label="Settled" value={`${settled}`} />
        <HeroStat label="Awaiting" value={`${summary.pending}`} />
        <HeroStat
          label="Overdue"
          value={`${summary.overdue}`}
          tone={summary.overdue > 0 ? 'alert' : undefined}
        />
      </dl>
    </section>
  )
}

function HeroStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'alert'
}) {
  return (
    <div className="px-3 py-3.5 text-center sm:py-4">
      <dd
        className={`stat-number text-xl font-extrabold leading-none sm:text-2xl ${
          tone === 'alert' ? 'text-red-300' : 'text-white'
        }`}
      >
        {value}
      </dd>
      <dt className="mt-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/45">
        {label}
      </dt>
    </div>
  )
}
