type ContributionStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'WAIVED'

const CONFIG: Record<ContributionStatus, { label: string; classes: string }> = {
  PENDING: { label: 'Pending',  classes: 'bg-amber-100 text-amber-700' },
  PARTIAL: { label: 'Partial',  classes: 'bg-blue-100 text-blue-700' },
  PAID:    { label: 'Paid',     classes: 'bg-green-100 text-green-700' },
  OVERDUE: { label: 'Overdue',  classes: 'bg-red-100 text-red-700' },
  WAIVED:  { label: 'Waived',   classes: 'bg-gray-100 text-gray-500' },
}

export function ContributionStatusBadge({ status }: { status: string }) {
  const cfg = CONFIG[status as ContributionStatus] ?? CONFIG.PENDING
  return (
    <span className={`status-pill text-xs font-semibold ${cfg.classes}`}>
      {cfg.label}
    </span>
  )
}
