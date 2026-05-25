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

export function ContributionSummaryCards({ summary }: { summary: Summary }) {
  const currentYear = new Date().getFullYear()

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <StatCard label="Total contributed" value={formatZAR(summary.totalPaid)} />
      <StatCard label={`${currentYear} total`} value={formatZAR(summary.yearlyPaid)} />
      <StatCard
        label="Paid periods"
        value={`${summary.paid} / ${summary.totalContributions}`}
        sub={summary.partial > 0 ? `${summary.partial} partial` : undefined}
      />
      <StatCard
        label="Overdue"
        value={`${summary.overdue}`}
        valueClass={summary.overdue > 0 ? 'text-red-600' : 'text-xxm-green-900'}
        sub={summary.overdue > 0 ? 'Action required' : 'All clear'}
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  valueClass = 'text-xxm-green-900',
}: {
  label: string
  value: string
  sub?: string
  valueClass?: string
}) {
  return (
    <div className="xxm-card p-4 space-y-1">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className={`text-xl font-bold amount ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}
