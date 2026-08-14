// The admin service, re-exported as one module so every existing
// `@/lib/services` import keeps working; the domains live in their own files
// beside this one.
//
// Only the error types come out of ./shared. assertAdmin, writeAuditLog,
// notifyInbox and roundZAR are exported there for the domain modules to use and
// are deliberately not re-exported here — they are this module's plumbing, and
// the public surface should come out of a refactor exactly as it went in.
export {
  AdminForbiddenError,
  AdminNotFoundError,
  AdminConflictError,
  SignatureLockError,
} from './shared'

export * from './members'
export * from './mandates'
export * from './contributions'
export * from './goals'
export * from './audit'
export * from './invitations'
export * from './reports'
export * from './signatures'
// Only the guarded entry points. `dueDateFor` and `DSR_RESPONSE_DAYS` are the
// module's own plumbing — the same reason assertAdmin and writeAuditLog are not
// re-exported above. `dueDateFor` in particular takes a Date rather than roles,
// and putting it on this surface would ask the authz guard to cover a pure
// function that has nothing to guard.
export {
  listDataRequests,
  logDataRequest,
  startDataRequest,
  closeDataRequest,
} from './data-requests'

// Same rule: only the guarded entry points. The retention constants and the
// date helpers stay inside the module.
export { assessErasure, eraseErasableData } from './erasure'
export type { ErasureAssessment, ErasureCategory, Disposition } from './erasure'
