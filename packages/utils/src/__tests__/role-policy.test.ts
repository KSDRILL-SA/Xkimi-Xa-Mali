import { describe, it, expect } from 'vitest'
import { refuseRoleChange, ROLE_CHANGE_REFUSAL_MESSAGE } from '../role-policy'

/**
 * The one-click way to end the system.
 *
 * There were two `setMemberRole` implementations — the member app's carried
 * these guards, the admin console's carried none, and the console's is the one
 * the UI calls. So the sole admin could open their own member page, click
 * "Remove admin", and leave the system with no admin at all: session ended by
 * the roleVersion bump, sign-in refused for want of the role, and no way to
 * grant it back because granting requires an admin. Recovery meant editing the
 * database.
 */

const base = { actorId: 'admin-1', targetId: 'member-2', adminCount: 3 }

describe('revoking ADMIN', () => {
  it('refuses an admin removing their own role, even with others around', () => {
    // The last-admin check alone would allow this whenever a second admin
    // happened to exist, and "happened to exist" is not a property worth
    // betting the console on. Somebody else can always do it, and requiring
    // that means every revocation leaves a person able to reverse it.
    expect(
      refuseRoleChange({ ...base, targetId: 'admin-1', role: 'ADMIN', assign: false }),
    ).toBe('SELF_ADMIN_REVOKE')
  })

  it('refuses removing the last admin', () => {
    expect(
      refuseRoleChange({ ...base, role: 'ADMIN', assign: false, adminCount: 1 }),
    ).toBe('LAST_ADMIN')
  })

  it('allows one admin to remove another when more remain', () => {
    expect(
      refuseRoleChange({ ...base, role: 'ADMIN', assign: false, adminCount: 2 }),
    ).toBeNull()
  })

  it('treats an unusable count as the last admin, not as plenty', () => {
    // A failed or unwritten count arriving as 0 or NaN must not read as "lots
    // of admins". This is the C-2 lesson: absent evidence is not good news.
    for (const adminCount of [0, -1, NaN, Infinity]) {
      expect(
        refuseRoleChange({ ...base, role: 'ADMIN', assign: false, adminCount }),
        `adminCount=${adminCount}`,
      ).toBe('LAST_ADMIN')
    }
  })
})

describe('revoking MEMBER', () => {
  it('refuses, because MEMBER is not a permission', () => {
    // Nothing in either app checks for it. Every member-facing service gates on
    // assertCanAccess, which lets an account reach its own data whatever roles
    // it holds — so removing MEMBER would change nothing while writing an audit
    // entry saying access was taken away. A control that lies is worse than an
    // absent one, because it gets believed.
    expect(refuseRoleChange({ ...base, role: 'MEMBER', assign: false })).toBe('MEMBER_NOT_REVOCABLE')
  })

  it('refuses regardless of who is asking or how many admins there are', () => {
    expect(
      refuseRoleChange({ actorId: 'a', targetId: 'a', role: 'MEMBER', assign: false, adminCount: 99 }),
    ).toBe('MEMBER_NOT_REVOCABLE')
  })

  it('points at suspension, which is the thing that actually ends access', () => {
    expect(ROLE_CHANGE_REFUSAL_MESSAGE.MEMBER_NOT_REVOCABLE).toMatch(/suspend/i)
  })
})

describe('granting', () => {
  it('is never refused — adding an admin cannot lock anybody out', () => {
    expect(refuseRoleChange({ ...base, role: 'ADMIN', assign: true, adminCount: 0 })).toBeNull()
    expect(refuseRoleChange({ ...base, role: 'MEMBER', assign: true, adminCount: 0 })).toBeNull()
  })

  it('allows granting to yourself, which is how a sole founder-admin works', () => {
    // Recorded as a decision: with one admin who is himself a founder there is
    // no alternative, and self-grants are marked as such in the audit payload.
    expect(
      refuseRoleChange({ actorId: 'a', targetId: 'a', role: 'ADMIN', assign: true, adminCount: 1 }),
    ).toBeNull()
  })
})

describe('every refusal explains itself', () => {
  it('has a message a person can act on, for each reason', () => {
    for (const [reason, message] of Object.entries(ROLE_CHANGE_REFUSAL_MESSAGE)) {
      expect(message.length, reason).toBeGreaterThan(30)
      // Each one names what to do instead rather than only what was refused.
      expect(message, reason).toMatch(/ask|grant|suspend/i)
    }
  })
})
