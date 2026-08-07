/**
 * What to do when the freshness of a session's roles cannot be established.
 *
 * Kept separate from the middleware because it is the security decision, and a
 * decision buried inside a request handler is one nobody can test or argue
 * with. The lookup that produces the verdict needs Redis and the Edge runtime;
 * this does not.
 */

export type RoleVersionVerdict =
  /** The stored version matches or trails the token: the session is current. */
  | 'fresh'
  /** The stored version is ahead: roles or status changed, the token is stale. */
  | 'stale'
  /**
   * No answer available — Redis unreachable, unconfigured, or the key is gone.
   * Not the same as 'fresh'. Treating it as such is what let a revoked session
   * come back to life once its stored key expired.
   */
  | 'unverifiable'

/**
 * Whether the session must be re-established.
 *
 * `stale` always forces re-auth. `unverifiable` is resolved by what the session
 * is able to do:
 *
 * - **Privileged sessions fail closed.** An admin can approve mandates, reverse
 *   transactions and suspend members. Letting one continue on roles that cannot
 *   be confirmed is exactly the position an attacker wants after an admin has
 *   been demoted, and the cost of being wrong is a sign-in.
 * - **Member sessions fail open.** Failing closed for everyone would convert a
 *   brief Redis outage into a site-wide sign-out — an availability incident
 *   caused by the security control, affecting members whose worst case is
 *   reading their own balance with roles that are almost certainly unchanged.
 *
 * The asymmetry is the point: match the response to what is actually at stake.
 */
export function mustReauthenticate(
  verdict: RoleVersionVerdict,
  isPrivileged: boolean,
): boolean {
  if (verdict === 'stale') return true
  if (verdict === 'unverifiable') return isPrivileged
  return false
}
