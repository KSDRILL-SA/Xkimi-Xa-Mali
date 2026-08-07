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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(({ icon: Icon, label, value, sub, gradient, iconBg, iconColor, border, valueColor }) => (
        <div
          key={label}
          className={`group relative overflow-hidden bg-gradient-to-b ${gradient} rounded-2xl border ${border} shadow-xxm-sm p-5 hover:shadow-xxm hover:-translate-y-0.5 transition-all duration-fast ease-smooth`}
        >
          <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center mb-4 transition-transform duration-slow group-hover:scale-110`}>
            <Icon size={18} className={iconColor} aria-hidden />
          </div>
          <p className={`stat-number text-2xl font-extrabold leading-none ${valueColor ?? 'text-xxm-green-900'}`}>
            {value}
          </p>
          <p className="text-xs font-semibold text-xxm-gray-600 mt-1.5">{label}</p>
          {sub && <p className="text-[11px] text-xxm-gray-400 mt-0.5">{sub}</p>}
        </div>
      ))}
    </div>
  )
}
