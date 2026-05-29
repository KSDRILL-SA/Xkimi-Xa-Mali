import { STATUS_STYLES } from '@xxm/utils'

type ContributionStatus = keyof typeof STATUS_STYLES.contribution

export function ContributionStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_STYLES.contribution[status as ContributionStatus] ?? STATUS_STYLES.contribution.PENDING
  return (
    <span className={cfg.className} role="status">
      {cfg.label}
    </span>
  )
}
