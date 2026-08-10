import { describe, it, expect } from 'vitest'
import { refuseStatusChange, ADMIN_SETTABLE_STATUSES } from '../status-policy'

/**
 * Roles were given a last-admin guard and a self-revocation guard. Suspension
 * was not — and `role-policy` tells admins to use it: "to end somebody's
 * access, suspend the account instead". The recommended route was the
 * unguarded one, and it reaches the same place: an admin able to lock the
 * circle out of its own console with no admin left to undo it.
 */

const base = {
  actorId: 'admin-1',
  targetId: 'member-1',
  requestedStatus: 'SUSPENDED',
  targetIsAdmin: false,
  activeAdminCount: 3,
}

describe('statuses leadership may set', () => {
  it('allows the three the console offers', () => {
    for (const status of ADMIN_SETTABLE_STATUSES) {
      expect(refuseStatusChange({ ...base, requestedStatus: status })).toBeNull()
    }
  })

  it('refuses RESIGNED', () => {
    // The schema calls it "chose to leave. Not a deletion and not a
    // punishment" — a member's account of their own decision. An admin writing
    // it would record that somebody left when they were removed, and would do
    // it without `resignedAt`, leaving a row that contradicts itself.
    expect(refuseStatusChange({ ...base, requestedStatus: 'RESIGNED' })).toBe('NOT_ADMIN_SETTABLE')
  })

  it('refuses anything that is not a status at all', () => {
    // The value arrives from a form field; the dropdown is not a guarantee.
    expect(refuseStatusChange({ ...base, requestedStatus: 'DELETED' })).toBe('NOT_ADMIN_SETTABLE')
    expect(refuseStatusChange({ ...base, requestedStatus: '' })).toBe('NOT_ADMIN_SETTABLE')
    expect(refuseStatusChange({ ...base, requestedStatus: 'active' })).toBe('NOT_ADMIN_SETTABLE')
  })
})

describe('suspending', () => {
  it('refuses an admin suspending their own account', () => {
    // Refused even with other admins around, for the reason the role policy
    // gives: whether you can lock yourself out should not depend on the state
    // of somebody else's account.
    expect(refuseStatusChange({ ...base, targetId: 'admin-1', activeAdminCount: 5 }))
      .toBe('SELF_SUSPEND')
  })

  it('refuses suspending the last admin who can sign in', () => {
    expect(refuseStatusChange({ ...base, targetId: 'admin-2', targetIsAdmin: true, activeAdminCount: 1 }))
      .toBe('LAST_ADMIN')
  })

  it('allows suspending an admin while another remains', () => {
    expect(refuseStatusChange({ ...base, targetId: 'admin-2', targetIsAdmin: true, activeAdminCount: 2 }))
      .toBeNull()
  })

  it('allows suspending an ordinary member', () => {
    expect(refuseStatusChange({ ...base, activeAdminCount: 1 })).toBeNull()
  })

  it('treats a count of zero as the last admin too', () => {
    // Defensive: a caller that fails to count must not be read as "plenty".
    expect(refuseStatusChange({ ...base, targetId: 'admin-2', targetIsAdmin: true, activeAdminCount: 0 }))
      .toBe('LAST_ADMIN')
  })
})

describe('the changes that give access back', () => {
  it('lets an admin reactivate themselves or anyone else', () => {
    // Only suspension takes access away. Reactivating can always be undone, so
    // it carries none of the guards.
    expect(refuseStatusChange({ ...base, requestedStatus: 'ACTIVE', targetId: 'admin-1' })).toBeNull()
    expect(refuseStatusChange({
      ...base, requestedStatus: 'ACTIVE', targetIsAdmin: true, activeAdminCount: 0,
    })).toBeNull()
  })

  it('lets an account be returned to PENDING', () => {
    expect(refuseStatusChange({ ...base, requestedStatus: 'PENDING', targetId: 'admin-1' })).toBeNull()
  })
})
