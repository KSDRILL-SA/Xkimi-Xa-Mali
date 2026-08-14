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
   * A role-version cache exists, and it did not answer — unreachable, or the
   * key is gone. Not the same as 'fresh'. Treating it as such is what let a
   * revoked session come back to life once its stored key expired.
   */
  | 'unverifiable'
  /**
   * There is no role-version cache configured at all.
   *
   * Deliberately distinct from `unverifiable`, because the two are opposite
   * situations that used to share an answer. See {@link mustReauthenticate}.
   */
  | 'unconfigured'

/**
 * Whether the session must be re-established.
 *
 * `stale` always forces re-auth. The two "no answer" verdicts do not share a
 * response, and separating them is the whole point of this file.
 *
 * ── Configured but not answering: fail closed for admins ────────────────────
 *
 * An admin can approve mandates, reverse transactions and suspend members.
 * Letting one continue on roles that cannot be confirmed is exactly the
 * position an attacker wants after an admin has been demoted. Members fail
 * open: converting a brief outage into a site-wide sign-out is an availability
 * incident caused by the security control, and their worst case is reading
 * their own balance with roles almost certainly unchanged.
 *
 * When the cache is merely unreachable, re-authenticating does eventually work
 * — login re-seeds the key the moment Redis comes back — so the cost of being
 * wrong really is a sign-in.
 *
 * ── Not configured at all: there is nothing to fail closed about ────────────
 *
 * This case used to be folded into `unverifiable`, and the result was that
 * **an admin could not use the app at all**. Not once, permanently: sign-in
 * succeeds, the next request finds the roles unverifiable, and the admin is
 * returned to the login page holding a valid session. Signing in again cannot
 * help, because there is no cache for login to seed. The loop has no exit.
 *
 * The justification given for failing closed — "the cost of being wrong is a
 * sign-in" — is simply untrue here, and the security benefit is zero: with no
 * cache there is no revocation channel, so there is no revocation this could
 * be enforcing. It denied service to every admin and protected nothing.
 *
 * So a deployment with no role-version cache is treated as one that does not
 * operate this control, which is what it is. The middleware says so in the log
 * once per process rather than silently.
 *
 * Found by signing in as an admin on a machine with no Redis configured and
 * watching the login page hand the session straight back.
 */
export function mustReauthenticate(
  verdict: RoleVersionVerdict,
  isPrivileged: boolean,
): boolean {
  if (verdict === 'stale') return true
  if (verdict === 'unverifiable') return isPrivileged
  // 'unconfigured' and 'fresh' both pass.
  return false
}
