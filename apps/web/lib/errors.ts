// Central error hierarchy for the entire application.
// All services import from here; API routes catch AppError and map it to HTTP responses.

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = this.constructor.name
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor)
  }
}

// ─── Generic HTTP errors ──────────────────────────────────────────────────────

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'SYS_002', 401)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 'SYS_003', 403)
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'SYS_404') {
    super(message, code, 404)
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'SYS_409') {
    super(message, code, 409)
  }
}

export class ValidationError extends AppError {
  constructor(message: string, code = 'VAL_001') {
    super(message, code, 422)
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again later.') {
    super(message, 'SYS_005', 429)
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, detail?: string) {
    super(`${service} service error${detail ? `: ${detail}` : ''}`, 'EXT_001', 502)
  }
}

// ─── Auth domain ──────────────────────────────────────────────────────────────

export class InvalidTokenError extends AppError {
  constructor(message = 'Invalid or expired token') {
    super(message, 'AUTH_004', 400)
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message = 'Invalid email or password') {
    super(message, 'AUTH_001', 401)
  }
}

export class UserAlreadyExistsError extends ConflictError {
  constructor(field: 'email' | 'phone') {
    super(`An account with this ${field} already exists`, 'MBR_002')
  }
}

// ─── Member domain ────────────────────────────────────────────────────────────

export class MemberNotFoundError extends NotFoundError {
  constructor() { super('Member not found', 'MBR_001') }
}

// ─── Bank account domain ──────────────────────────────────────────────────────

export class BankAccountNotFoundError extends NotFoundError {
  constructor() { super('Bank account not found', 'BNK_001') }
}

export class BankAccountConflictError extends ConflictError {
  constructor(message: string, code = 'BNK_002') { super(message, code) }
}

// ─── Mandate domain ───────────────────────────────────────────────────────────

export class MandateNotFoundError extends NotFoundError {
  constructor() { super('Mandate not found', 'MND_001') }
}

export class MandateConflictError extends ConflictError {
  constructor(message: string, code = 'MND_002') { super(message, code) }
}

// ─── Contribution domain ──────────────────────────────────────────────────────

export class ContributionNotFoundError extends NotFoundError {
  constructor() { super('Contribution not found', 'CTR_001') }
}

export class ContributionConflictError extends ConflictError {
  constructor(message: string, code = 'CTR_002') { super(message, code) }
}

// ─── Transaction domain ───────────────────────────────────────────────────────

export class TransactionNotFoundError extends NotFoundError {
  constructor() { super('Transaction not found', 'TXN_001') }
}

// ─── Goal domain ──────────────────────────────────────────────────────────────

export class GoalNotFoundError extends NotFoundError {
  constructor() { super('Goal not found', 'GOL_001') }
}

export class GoalConflictError extends ConflictError {
  constructor(message: string, code = 'GOL_002') { super(message, code) }
}

// ─── Invite domain ────────────────────────────────────────────────────────────

export class InviteNotFoundError extends AppError {
  constructor() { super('Invalid invite code', 'INV_001', 400) }
}

export class InviteUsedError extends AppError {
  constructor() { super('This invite code has already been used', 'INV_002', 400) }
}

export class InviteRevokedError extends AppError {
  constructor() { super('This invite code has been revoked', 'INV_003', 400) }
}

export class InviteExpiredError extends AppError {
  constructor() { super('This invite code has expired', 'INV_004', 400) }
}

export class InviteBindingError extends AppError {
  constructor() { super('Email or phone does not match the invite', 'INV_005', 403) }
}

export class InviteDuplicateError extends ConflictError {
  constructor() { super('An active invite or account already exists for this email or phone', 'INV_006') }
}

// ─── Report domain ────────────────────────────────────────────────────────────

export class ReportNotFoundError extends NotFoundError {
  constructor(message = 'No data found for the requested period') {
    super(message, 'RPT_001')
  }
}

// ─── Admin domain ─────────────────────────────────────────────────────────────

export class AdminNotFoundError extends NotFoundError {
  constructor(message = 'Resource not found') { super(message, 'ADM_001') }
}

export class AdminConflictError extends ConflictError {
  constructor(message: string) { super(message, 'ADM_002') }
}

// ─── Community domain ─────────────────────────────────────────────────────────

export class MessageNotFoundError extends NotFoundError {
  constructor() { super('Message not found', 'MSG_001') }
}

export class MessageLimitError extends AppError {
  constructor() { super('Daily message limit reached', 'MSG_002', 429) }
}

export class MessageEditWindowError extends AppError {
  constructor() {
    super('Messages can only be edited or deleted within 5 minutes of posting', 'MSG_003', 403)
  }
}

export class MessageDepthError extends AppError {
  constructor() {
    super('Cannot reply to a reply — maximum thread depth reached', 'MSG_004', 422)
  }
}

// ─── Budget domain ────────────────────────────────────────────────────────────

export class BudgetNotFoundError extends NotFoundError {
  constructor() { super('Budget not found', 'BGT_001') }
}

export class BudgetExceededError extends AppError {
  constructor(details: {
    budget: number
    alreadyContributed: number
    remaining: number
    overage: number
  }) {
    super('This contribution would exceed your budget', 'BUDGET_001', 422, details)
  }
}

// ─── Signature domain ─────────────────────────────────────────────────────────

export class NoSignatureError extends ConflictError {
  constructor() {
    super(
      'Admin signature is required before generating documents. Please upload your signature in Settings.',
      'SIG_001',
    )
  }
}

export class SignatureLockError extends AppError {
  constructor(nextChangeAllowedAt: Date) {
    super('Signature can only be changed once every 90 days', 'SIG_002', 423, {
      nextChangeAllowedAt: nextChangeAllowedAt.toISOString(),
    })
  }
}

// ─── Type guard ───────────────────────────────────────────────────────────────

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError
}
