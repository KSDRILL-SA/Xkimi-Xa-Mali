/**
 * Which account-status changes an admin may make, and which must be refused.
 *
 * The sibling of `role-policy`, and it exists because that file points here:
 * its `MEMBER_NOT_REVOCABLE` message tells an admin "to end somebody's access,
 * suspend the account instead". Roles were given a last-admin guard and a
 * self-revocation guard; suspension — the route that file recommends — had
 * neither, and reaches the same outcome. An admin could suspend their own
 * account, or the last remaining admin's, and lock the circle out of its own
 * console with no admin left to undo it.
 */

/** The statuses an admin may set from the console. */
export const ADMIN_SETTABLE_STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED'] as const
export type AdminSettableStatus = (typeof ADMIN_SETTABLE_STATUSES)[number]

export type StatusChangeInput = {
  /** The admin performing the change. */
  actorId: string
  /** The account being changed. */
  targetId: string
  /** Whatever arrived from the client — deliberately unnarrowed. */
  requestedStatus: string
  /** Whether the target currently holds ADMIN. */
  targetIsAdmin: boolean
  /**
   * Admins who can still sign in — ACTIVE, undeleted, holding ADMIN.
   * Counted including the target, so suspending the last one leaves zero.
   */
  activeAdminCount: number
}

export type StatusChangeRefusal =
  /** A status only the member themselves can reach, or not a status at all. */
  | 'NOT_ADMIN_SETTABLE'
  /** An admin suspending their own account. */
  | 'SELF_SUSPEND'
  /** The suspension would leave nobody able to administer. */
  | 'LAST_ADMIN'

/** What to tell the admin. Written to be read in a UI, not a log. */
export const STATUS_CHANGE_REFUSAL_MESSAGE: Record<StatusChangeRefusal, string> = {
  NOT_ADMIN_SETTABLE:
    'That is not a status leadership can set. Resignation is a member’s own decision and is recorded when they make it.',
  SELF_SUSPEND:
    'You cannot suspend your own account. Ask another admin to do it, so there is always somebody able to undo it.',
  LAST_ADMIN:
    'Cannot suspend the last admin — at least one admin must be able to sign in. Grant admin to somebody else first.',
}

/**
 * Whether this status change must be refused, and why. Null means allowed.
 *
 * **RESIGNED is refused, and that is a statement about what it means.** The
 * schema calls it "chose to leave. Not a deletion and not a punishment" — it
 * is a member's account of their own decision. An admin writing it would put
 * words in somebody's mouth, and the audit entry would say a member left when
 * leadership removed them. It also arrives without `resignedAt`, leaving a row
 * that contradicts itself. Members resign through their own app; leadership
 * ends access by suspending, which says plainly who did it.
 *
 * **Self-suspension is refused even when other admins exist.** The last-admin
 * check alone would allow it whenever a second admin happened to be around,
 * which makes whether you can lock yourself out depend on the state of somebody
 * else's account. The same reasoning the role policy gives for self-revocation.
 *
 * The count is of admins who can actually *sign in*. An admin who is already
 * suspended is not somebody who can undo a mistake.
 */
export function refuseStatusChange(input: StatusChangeInput): StatusChangeRefusal | null {
  if (!ADMIN_SETTABLE_STATUSES.includes(input.requestedStatus as AdminSettableStatus)) {
    return 'NOT_ADMIN_SETTABLE'
  }

  // Only suspension takes access away, so only suspension needs the guards.
  // Reactivating or returning somebody to PENDING can always be undone.
  if (input.requestedStatus !== 'SUSPENDED') return null

  if (input.actorId === input.targetId) return 'SELF_SUSPEND'
  if (input.targetIsAdmin && input.activeAdminCount <= 1) return 'LAST_ADMIN'

  return null
}
