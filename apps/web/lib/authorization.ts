import { ForbiddenError } from './errors'

export const ROLES = {
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
} as const

export type RoleName = (typeof ROLES)[keyof typeof ROLES]

export function hasRole(roles: string[], role: RoleName): boolean {
  return roles.includes(role)
}

export function isAdmin(roles: string[]): boolean {
  return hasRole(roles, ROLES.ADMIN)
}

export function assertAdmin(roles: string[]): void {
  if (!isAdmin(roles)) {
    throw new ForbiddenError('Admin access required')
  }
}

export function assertCanAccess(
  targetUserId: string,
  requesterId: string,
  requesterRoles: string[],
): void {
  if (!canAccess(targetUserId, requesterId, requesterRoles)) {
    throw new ForbiddenError('Access denied')
  }
}

/**
 * The same rule, answered rather than thrown — for callers that must not reveal
 * whether the object exists.
 *
 * ── When 403 is an answer you did not mean to give ─────────────────────────
 *
 * A service that loads by id, throws "not found" when the row is missing, and
 * *then* asks whether the caller may see it has told the caller two different
 * things:
 *
 *     404  ->  no such mandate
 *     403  ->  that mandate exists, and it is somebody else's
 *
 * The second is a fact about another member that nobody agreed to share. Ids
 * are `cuid()` so nobody is enumerating them at scale, and this circle is fifty
 * people who know each other — but an id reaches an inbox, a screenshot, a
 * shared link, and the answer to "is this real?" should not be free.
 *
 * ── Where this is the right tool, and where it is not ──────────────────────
 *
 * Only for objects the requester could not otherwise enumerate: mandates, a
 * member's contributions, bank accounts, statements. For those, unauthorised
 * and nonexistent must be indistinguishable, which means one combined check:
 *
 *     if (!mandate || !canAccess(mandate.userId, requesterId, roles)) throw new MandateNotFoundError()
 *
 * It is deliberately **not** used for community messages or goal comments.
 * Every member can already see those on the board and under the goal, so their
 * existence is not a secret and "not found" would be a lie about something on
 * the screen. There, "you can only delete your own messages" is both true and
 * more useful.
 *
 * Where the target is a **userId parameter** rather than a loaded row — as in
 * `getContributions(userId, requesterId, roles)` — `assertCanAccess` is already
 * correct and leaks nothing: it runs before any lookup, so a stranger's id and
 * a nonexistent one produce the same refusal.
 */
export function canAccess(
  targetUserId: string,
  requesterId: string,
  requesterRoles: string[],
): boolean {
  return targetUserId === requesterId || isAdmin(requesterRoles)
}

export function assertNotSelf(
  actorId: string,
  targetId: string,
  action: string,
): void {
  if (actorId === targetId) {
    throw new ForbiddenError(`Cannot ${action} your own account`)
  }
}
