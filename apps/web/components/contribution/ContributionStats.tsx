'use client'

import { useCountUp } from '@/lib/hooks/useCountUp'
import { CheckCircle2, Clock, AlertTriangle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CARD, CARD_ICON } from './motion'

type Summary = {
  paid: number
  partial: number
  pending: number
  overdue: number
  totalContributions: number
}

/**
 * Three counts, in the dashboard's stat-card language.
 *
 * ── Why three and not four ─────────────────────────────────────────────────
 *
 * The page used to open with four cards of identical weight, two of them
 * money: "Total contributed" sat beside "Overdue: 0" at the same size, so
 * nothing led and the eye had no entry point. The two money figures moved into
 * the hero, where one of them can be the largest thing on the screen.
 *
 * What is left is genuinely a set: three counts of periods, mutually
 * exclusive, adding up to the record below them. Equal weight is correct for
 * these, which is what makes a three-up grid right rather than a compromise.
 *
 * ── Why the counts still animate ───────────────────────────────────────────
 *
 * Because they can now. The count-up was never what tore this page — the
 * shell's transform was, and it is gone. See `motion.ts`.
 */
export function ContributionStats({ summary }: { summary: Summary }) {
  const settled = summary.paid + summary.partial
  const hasOverdue = summary.overdue > 0

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
      <StatCard
        icon={CheckCircle2}
        label="Settled"
        sub={summary.partial > 0 ? `${summary.partial} part-paid` : 'Fully paid'}
        value={settled}
        gradient="from-emerald-50"
        border="border-emerald-200/70"
        iconBg="bg-emerald-100"
        iconColor="text-emerald-600"
      />
      <StatCard
        icon={Clock}
        label="Awaiting"
        sub="Not yet due"
        value={summary.pending}
        gradient="from-amber-50"
        border="border-xxm-gold/25"
        iconBg="bg-xxm-gold/15"
        iconColor="text-xxm-gold-dark"
      />
      <StatCard
        icon={AlertTriangle}
        label="Overdue"
        sub={hasOverdue ? 'Needs action' : 'All clear'}
        value={summary.overdue}
        gradient={hasOverdue ? 'from-red-50' : 'from-xxm-green-50'}
        border={hasOverdue ? 'border-red-200' : 'border-xxm-green/15'}
        iconBg={hasOverdue ? 'bg-red-100' : 'bg-xxm-green/10'}
        iconColor={hasOverdue ? 'text-red-500' : 'text-xxm-green'}
        valueColor={hasOverdue ? 'text-red-600' : undefined}
      />
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  sub,
  value,
  gradient,
  border,
  iconBg,
  iconColor,
  valueColor,
}: {
  icon: LucideIcon
  label: string
  sub: string
  value: number
  gradient: string
  border: string
  iconBg: string
  iconColor: string
  valueColor?: string
}) {
  const count = useCountUp(value, 900)

  return (
    <div className={`group min-w-0 p-3.5 sm:p-5 ${CARD} ${gradient} ${border}`}>
      <span className={`${CARD_ICON} mb-2.5 h-8 w-8 sm:mb-4 sm:h-10 sm:w-10 ${iconBg}`} aria-hidden>
        <Icon size={14} className={`${iconColor} sm:hidden`} />
        <Icon size={17} className={`hidden ${iconColor} sm:block`} />
      </span>
      <p
        className={`stat-number text-xl font-extrabold leading-none sm:text-2xl ${
          valueColor ?? 'text-xxm-green-900'
        }`}
      >
        {count}
      </p>
      <p className="mt-1.5 text-[11px] font-semibold text-xxm-gray-600 sm:text-xs">{label}</p>
      {/* Hidden at 360px: three cards share the row, and a second caption line
          wraps to three lines and doubles the card's height. */}
      <p className="mt-0.5 hidden text-[11px] text-xxm-gray-400 sm:block">{sub}</p>
    </div>
  )
}
