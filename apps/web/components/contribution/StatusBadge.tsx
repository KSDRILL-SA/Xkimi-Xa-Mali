type ContributionStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'WAIVED'

const CONFIG: Record<ContributionStatus, { label: string; classes: string }> = {
  PENDING: { label: 'Pending', classes: 'xxm-status-warning' },
  PARTIAL: { label: 'Partial', classes: 'xxm-status-pending' },
  PAID:    { label: 'Paid',    classes: 'xxm-status-success' },
  OVERDUE: { label: 'Overdue', classes: 'xxm-status-danger'  },
  WAIVED:  { label: 'Waived',  classes: 'xxm-status-info'    },
}

export function ContributionStatusBadge({ status }: { status: string }) {
  const cfg = CONFIG[status as ContributionStatus] ?? CONFIG.PENDING
  return (
    <span className={cfg.classes} role="status">
      {cfg.label}
    </span>
  )
}
