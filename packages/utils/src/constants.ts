export const APP_NAME     = 'Xkimm Xa Mali Foundation'
export const APP_ABBR    = 'XXM'
export const MIN_CONTRIBUTION_ZAR  = 100
export const MAX_CONTRIBUTION_ZAR  = 10_000
export const CONTRIBUTION_STEP_ZAR = 50
export const DEFAULT_DEBIT_DAY     = 1
export const DEFAULT_INVITE_AMOUNT = 200

/**
 * The size of the circle. Fifty, and not a number we are working toward
 * escaping — the Founder Guide is explicit that "the cap is a design decision,
 * not a limit we are waiting to escape."
 *
 * A seat is occupied by any member who has not been erased, whatever their
 * status: a suspended member keeps their history and their place, and a member
 * who has registered but is not yet activated already has one. A pending
 * invitation holds a seat too — otherwise fifty-one links could be issued and
 * the fifty-first person would be turned away in the moment they tried to join.
 */
export const MAX_MEMBERS = 50

/**
 * How many founders there are. Four, and it is not a number that grows.
 *
 * Enforced rather than remembered, for the same reason as {@link MAX_MEMBERS}:
 * a cap that lives only in someone's head is a cap until the day it isn't. The
 * badge is granted by hand, so without this a mis-click makes a fifth founder
 * and nothing objects.
 *
 * The marketing site's founder roster is checked against this by a test. The two
 * encode the same fact about the same four people and were otherwise free to
 * drift apart.
 */
export const FOUNDER_COUNT = 4
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
