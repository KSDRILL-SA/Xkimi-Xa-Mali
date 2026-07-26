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
