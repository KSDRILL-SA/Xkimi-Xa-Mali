'use client'

import { useCountUp } from '@/lib/hooks/useCountUp'
import { formatZAR } from '@/lib/formatters'
import { Landmark } from 'lucide-react'

/**
 * What the Foundation holds, and where it came from.
 *
 * ── Why the split is the point ─────────────────────────────────────────────
 *
 * The pool ledger has always tagged every entry with its source — `TRANSACTION`
 * for a monthly contribution, `GOAL_PAYMENT` for money directed at a named goal
 * — and nothing had ever read that distinction. `getPoolBalance` returned one
 * number, and only an admin endpoint called it.
 *
 * So a member could see their own months, and each goal's progress, and never
 * the whole. In a stokvel that is the question the whole arrangement rests on.
 *
 * The motion rule from the contributions page applies here unchanged: the orbs
 * are absolutely positioned siblings with explicit layer promotion, never
 * wrappers around the counting total. See
 * `apps/web/components/contribution/motion.ts`.
 */
export function FundHero({
  balance,
  monthly,
  goals,
}: {
  balance: number
  monthly: number
  goals: number
}) {
  // Cents, so the decimals animate rather than snapping on at the end.
  const total = useCountUp(Math.round(balance * 100), 900)

  // Guarded: with an empty pool this is 0/0, and a NaN width silently renders
  // nothing rather than failing loudly.
  const monthlyPct = balance > 0 ? Math.round((monthly / balance) * 100) : 0
  const goalsPct = balance > 0 ? 100 - monthlyPct : 0

  return (
    <section
      aria-label="Total fund"
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-xxm-green via-xxm-canopy to-xxm-green-900 text-white shadow-xxm-lg"
    >
      <div className="noise-overlay" aria-hidden />
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

      <div className="relative z-10 px-5 py-6 sm:px-8 sm:py-8">
        <span className="glass-gold inline-flex items-center gap-2 rounded-full px-3 py-1.5">
          <Landmark size={12} className="text-xxm-gold" aria-hidden />
          <span className="text-[10px] font-bold uppercase tracking-widest text-xxm-gold sm:text-[11px]">
            The Foundation holds
          </span>
        </span>

        <p className="stat-number mt-3.5 break-words font-display text-4xl font-black leading-none tracking-tight sm:text-5xl">
          {formatZAR(total / 100)}
        </p>
        <p className="mt-2 text-[11px] text-white/50">
          Every rand collected, less anything reversed
        </p>

        {/* One bar, two sources. A stacked bar says "these are parts of one
            whole" in a way two separate figures never do. */}
        <div className="mt-6 max-w-md sm:mt-7">
          <span
            className="flex h-2 w-full overflow-hidden rounded-full bg-white/12"
            role="img"
            aria-label={`${monthlyPct}% from monthly contributions, ${goalsPct}% from goal payments`}
          >
            <span
              className="block h-full bg-xxm-gold transition-[width] duration-700 ease-smooth"
              style={{ width: `${monthlyPct}%` }}
            />
            <span
              className="block h-full bg-white/45 transition-[width] duration-700 ease-smooth"
              style={{ width: `${goalsPct}%` }}
            />
          </span>

          <dl className="mt-4 grid grid-cols-2 gap-4">
            <SourceStat
              swatch="bg-xxm-gold"
              label="Monthly contributions"
              value={monthly}
              pct={monthlyPct}
            />
            <SourceStat
              swatch="bg-white/45"
              label="Toward goals"
              value={goals}
              pct={goalsPct}
            />
          </dl>
        </div>
      </div>
    </section>
  )
}

function SourceStat({
  swatch,
  label,
  value,
  pct,
}: {
  swatch: string
  label: string
  value: number
  pct: number
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/50">
        <span className={`h-2 w-2 shrink-0 rounded-full ${swatch}`} aria-hidden />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="stat-number mt-1.5 break-words text-lg font-extrabold leading-none sm:text-xl">
        {formatZAR(value)}
      </dd>
      <p className="mt-1 text-[11px] text-white/40">{pct}% of the fund</p>
    </div>
  )
}
