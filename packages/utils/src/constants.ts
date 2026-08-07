export const APP_NAME     = 'Xkimm Xa Mali Foundation'
export const APP_ABBR    = 'XXM'
export const MIN_CONTRIBUTION_ZAR  = 100
export const MAX_CONTRIBUTION_ZAR  = 10_000
export const CONTRIBUTION_STEP_ZAR = 50
export const DEFAULT_DEBIT_DAY     = 1
export const DEFAULT_INVITE_AMOUNT = 200
export const MAX_TRANSACTION_RETRY = 3
export const IDEMPOTENCY_TTL_SECONDS = 60 * 60 * 72

/**
 * Marks a transaction that failed for reasons the member had no part in — the
 * gateway was unreachable, timed out, or errored.
 *
 * A decline and an outage both land as a FAILED transaction, but they mean
 * opposite things about the member. Only a decline says anything about their
 * account, so only a decline should reach them or count toward how they are
 * assessed. `failureReason` carries this prefix to keep the two apart.
 */
export const INFRASTRUCTURE_FAILURE_PREFIX = 'INFRASTRUCTURE: '

export const USER_STATUS = {
  PENDING:   'PENDING',
  ACTIVE:    'ACTIVE',
  SUSPENDED: 'SUSPENDED',
} as const

export const MANDATE_STATUS = {
  PENDING:   'PENDING',
  ACTIVE:    'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  CANCELLED: 'CANCELLED',
} as const

export const CONTRIBUTION_STATUS = {
  PENDING:  'PENDING',
  PARTIAL:  'PARTIAL',
  PAID:     'PAID',
  OVERDUE:  'OVERDUE',
  WAIVED:   'WAIVED',
} as const

export const GOAL_STATUS = {
  DRAFT:    'DRAFT',
  ACTIVE:   'ACTIVE',
  ACHIEVED: 'ACHIEVED',
  FAILED:   'FAILED',
} as const

export const STATUS_STYLES = {
  user: {
    ACTIVE:    { label: 'Active',    className: 'xxm-status-success' },
    PENDING:   { label: 'Pending',   className: 'xxm-status-warning' },
    SUSPENDED: { label: 'Suspended', className: 'xxm-status-danger'  },
  },
  mandate: {
    ACTIVE:    { label: 'Active',    className: 'xxm-status-success' },
    PENDING:   { label: 'Pending',   className: 'xxm-status-warning' },
    SUSPENDED: { label: 'Suspended', className: 'xxm-status-warning' },
    CANCELLED: { label: 'Cancelled', className: 'xxm-status-danger'  },
  },
  contribution: {
    PAID:    { label: 'Paid',    className: 'xxm-status-success' },
    PARTIAL: { label: 'Partial', className: 'xxm-status-pending' },
    PENDING: { label: 'Pending', className: 'xxm-status-warning' },
    OVERDUE: { label: 'Overdue', className: 'xxm-status-danger'  },
    WAIVED:  { label: 'Waived',  className: 'xxm-status-info'    },
  },
  goal: {
    DRAFT:    { label: 'Draft',    className: 'xxm-status-pending' },
    ACTIVE:   { label: 'Active',   className: 'xxm-status-success' },
    ACHIEVED: { label: 'Achieved', className: 'xxm-status-success' },
    FAILED:   { label: 'Failed',   className: 'xxm-status-danger'  },
  },
} as const
