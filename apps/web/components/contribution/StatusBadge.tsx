const BADGE_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  PAID:    { label: 'Paid',    dot: 'bg-xxm-green',  badge: 'bg-xxm-green-100 text-xxm-green-700' },
  PARTIAL: { label: 'Partial', dot: 'bg-sky-500',    badge: 'bg-sky-100 text-sky-700' },
  PENDING: { label: 'Pending', dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700' },
  OVERDUE: { label: 'Overdue', dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700' },
  WAIVED:  { label: 'Waived',  dot: 'bg-xxm-gray-400', badge: 'bg-xxm-gray-100 text-xxm-gray-600' },
}

export function ContributionStatusBadge({ status }: { status: string }) {
  const cfg = BADGE_CONFIG[status] ?? BADGE_CONFIG.PENDING!
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${cfg.badge}`}
      role="status"
    >
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} aria-hidden />
      {cfg.label}
    </span>
  )
}
