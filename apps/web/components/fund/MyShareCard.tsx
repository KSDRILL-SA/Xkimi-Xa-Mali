'use client'

import { useCountUp } from '@/lib/hooks/useCountUp'
import { formatZAR } from '@/lib/formatters'
import { CARD, CARD_ICON } from '@/components/contribution/motion'
import { Wallet, Target, PiggyBank } from 'lucide-react'

/**
 * What this member has actually given, split the way the fund is split.
 *
 * ── The number this exists to correct ──────────────────────────────────────
 *
 * The dashboard and the contributions page both showed **"Total contributed"**
 * from `getMemberSummary`, which sums `Contribution.amountPaid` and nothing
 * else. `GoalPayment` is a separate table, so money a member directed at a goal
 * was in none of it.
 *
 * A member who paid R6 000 in months and R2 000 into goals was shown R6 000,
 * under a label that plainly means everything they had put in. The R2 000
 * appeared in no member-facing total anywhere in the app.
 *
 * These three figures come from the pool ledger scoped to `memberId`, which is
 * the same arithmetic as the group total above them rather than a parallel one
 * that can drift.
 */
export function MyShareCard({
  monthly,
  goals,
  total,
  fundBalance,
}: {
  monthly: number
  goals: number
  total: number
  fundBalance: number
}) {
  const sharePct = fundBalance > 0 ? Math.round((total / fundBalance) * 100) : 0

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
      <ShareStat
        icon={PiggyBank}
        label="You have given"
        value={total}
        sub={fundBalance > 0 ? `${sharePct}% of the fund` : undefined}
        gradient="from-xxm-green-50"
        border="border-xxm-green/15"
        iconBg="bg-xxm-green/10"
        iconColor="text-xxm-green"
        emphasis
      />
      <ShareStat
        icon={Wallet}
        label="Monthly contributions"
        value={monthly}
        gradient="from-amber-50"
        border="border-xxm-gold/25"
        iconBg="bg-xxm-gold/15"
        iconColor="text-xxm-gold-dark"
      />
      <ShareStat
        icon={Target}
        label="Toward goals"
        value={goals}
        gradient="from-emerald-50"
        border="border-emerald-200/70"
        iconBg="bg-emerald-100"
        iconColor="text-emerald-600"
      />
    </div>
  )
}

function ShareStat({
  icon: Icon,
  label,
  value,
  sub,
  gradient,
  border,
  iconBg,
  iconColor,
  emphasis = false,
}: {
  icon: React.ElementType
  label: string
  value: number
  sub?: string
  gradient: string
  border: string
  iconBg: string
  iconColor: string
  emphasis?: boolean
}) {
  const count = useCountUp(Math.round(value * 100), 900)

  return (
    <div className={`group min-w-0 p-4 sm:p-5 ${CARD} ${gradient} ${border}`}>
      <span className={`${CARD_ICON} mb-3 sm:mb-4 ${iconBg}`} aria-hidden>
        <Icon size={17} className={iconColor} />
      </span>
      <p
        className={`stat-number break-words font-extrabold leading-none text-xxm-green-900 ${
          emphasis ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'
        }`}
      >
        {formatZAR(count / 100)}
      </p>
      <p className="mt-1.5 text-[11px] font-semibold text-xxm-gray-600 sm:text-xs">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-xxm-gray-400">{sub}</p>}
    </div>
  )
}
