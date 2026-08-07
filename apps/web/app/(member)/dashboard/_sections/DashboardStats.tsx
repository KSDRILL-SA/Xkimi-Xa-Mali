import { getSession } from '@/lib/session'
import { getMemberSummary } from '@/services/member.service'
import { AnimatedStatCard } from '@/components/dashboard/AnimatedStatCard'
import { TrendingUp, Calendar, CheckCircle2 } from 'lucide-react'

export async function DashboardStats() {
  const session = await getSession()
  const userId = session!.user.id
  const roles = session!.user.roles ?? []

  const summary = await getMemberSummary(userId, userId, roles)
  const currentYear = new Date().getFullYear()

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <AnimatedStatCard
        icon={<TrendingUp size={18} className="text-xxm-green" aria-hidden />}
        label="Total contributed"
        value={summary.totalContributed}
        prefix="R "
        decimals={2}
        gradient="from-xxm-green-50 to-white"
        iconBg="bg-xxm-green/10"
        border="border-xxm-green/15"
      />
      <AnimatedStatCard
        icon={<Calendar size={18} className="text-xxm-gold-dark" aria-hidden />}
        label={`${currentYear} total`}
        value={summary.yearlyContributed}
        prefix="R "
        decimals={2}
        gradient="from-amber-50 to-white"
        iconBg="bg-xxm-gold/15"
        border="border-xxm-gold/20"
      />
      <AnimatedStatCard
        icon={<CheckCircle2 size={18} className="text-emerald-600" aria-hidden />}
        label="Paid contributions"
        value={summary.paidCount}
        suffix=" paid"
        gradient="from-emerald-50 to-white"
        iconBg="bg-emerald-100"
        border="border-emerald-200"
      />
    </div>
  )
}
