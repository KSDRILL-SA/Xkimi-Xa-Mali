export const APP_NAME     = 'Xkimm Xa Mali'
export const APP_ABBR    = 'XXM'
export const MIN_CONTRIBUTION_ZAR = 100

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
    PARTIAL: { label: 'Partial', className: 'xxm-status-warning' },
    PENDING: { label: 'Pending', className: 'xxm-status-pending' },
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
