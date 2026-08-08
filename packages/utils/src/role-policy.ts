/**
 * When a role change must be refused, decided once for both apps.
 *
 * There were two implementations of `setMemberRole` — one in the member app's
 * invite service, one in the admin console's — and only the member app's
 * carried the guards. The admin console calls its own, and that is the copy the
 * UI is wired to, so the protections existed in the codebase and not on the
 * path anyone actually took.
 *
 * What that allowed: the sole admin opens their own member page, clicks
 * "Remove admin", and the role is gone. `roleVersion` is bumped and published,
 * so the session ends immediately and correctly. They cannot sign back into the
 * console, because that requires the ADMIN role. Nothing can grant it back,
 * because granting requires an admin. By decision this system has exactly one
 * admin, so it now has none, and the only way back is editing the database.
 *
 * Pure and dependency-free on purpose. Each app throws its own error type from
 * its own layer; what neither app gets to have any more is its own opinion
 * about what is allowed. This is §9's recurring failure — a rule applied to one
 * app and not its sibling — and the fix is one rule, not two that agree today.
 */

export type RoleChangeRole = 'ADMIN' | 'MEMBER'

export interface RoleChangeRequest {
  /** The admin performing the change. */
  actorId: string
  /** The account being changed. May be the actor. */
  targetId: string
  role: RoleChangeRole
  /** True to grant, false to revoke. */
  assign: boolean
  /**
   * How many accounts currently hold ADMIN. Only consulted when revoking ADMIN,
   * so callers may skip the query otherwise and pass anything.
   */
  adminCount: number
}

export type RoleChangeRefusal =
  /** An admin revoking their own ADMIN role. */
  | 'SELF_ADMIN_REVOKE'
  /** The revocation would leave the system with no admin at all. */
  | 'LAST_ADMIN'
  /** MEMBER is not a permission and cannot be taken away. */
  | 'MEMBER_NOT_REVOCABLE'

/** What to tell the admin. Written to be read in a UI, not a log. */
export const ROLE_CHANGE_REFUSAL_MESSAGE: Record<RoleChangeRefusal, string> = {
  SELF_ADMIN_REVOKE:
    'You cannot remove your own admin role. Ask another admin to do it, so there is always somebody able to undo it.',
  LAST_ADMIN:
    'Cannot remove the last admin — at least one admin must remain. Grant admin to somebody else first.',
  MEMBER_NOT_REVOCABLE:
    'The member role cannot be removed. To end somebody’s access, suspend the account instead.',
}

/**
 * Whether this role change must be refused, and why. Null means allowed.
 *
 * **MEMBER is refused outright, and that is a statement about what it is.**
 * Nothing in either app ever checks for it: every member-facing service gates
 * on `assertCanAccess`, which permits an account to reach its own data
 * regardless of what roles it holds. Removing MEMBER would therefore change
 * nothing about what the account can do, while writing an audit entry that says
 * access was taken away — a control that lies is worse than an absent one,
 * because it will be believed. Ending access is what suspension is for.
 *
 * **Self-revocation of ADMIN is refused even when other admins exist.** The
 * last-admin check alone would permit it whenever a second admin happened to be
 * around, and "happened to be around" is not a property worth betting the
 * console on. Another admin can always perform the removal, and requiring that
 * means every revocation leaves somebody able to reverse it.
 */
export function refuseRoleChange(request: RoleChangeRequest): RoleChangeRefusal | null {
  const { actorId, targetId, role, assign, adminCount } = request

  // Granting is never refused here. Adding an admin cannot lock anybody out,
  // and adding MEMBER to an account that should have had it is a repair.
  if (assign) return null

  if (role === 'MEMBER') return 'MEMBER_NOT_REVOCABLE'

  if (actorId === targetId) return 'SELF_ADMIN_REVOKE'

  // Defensive on the count itself: a failed or unwritten query arriving here as
  // 0 or NaN must not read as "plenty of admins". Anything that is not a
  // number greater than one refuses.
  if (!Number.isFinite(adminCount) || adminCount <= 1) return 'LAST_ADMIN'

  return null
}
