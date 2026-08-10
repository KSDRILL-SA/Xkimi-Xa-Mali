/**
 * What somebody who has left the circle may still do.
 *
 * A resigned member keeps their account and their history — "leave at any time,
 * with your history intact". They can sign in, read what they contributed, and
 * take their data with them. What they are not is a participant: the money and
 * the group are for people who are still in it.
 *
 * Sign-in refuses PENDING and SUSPENDED and lets RESIGNED through, which is
 * right. But every member-facing service gates on `assertCanAccess` — is this
 * your own data — and none of them asked whether the person is still a member.
 * So somebody who had resigned could still pay a contribution, set up a debit
 * order, fund a goal, commit to a monthly plan, propose a goal, cheer, comment
 * and post to the circle.
 *
 * ── Why this is a list of exceptions rather than a list of rules ────────────
 *
 * The obvious implementation is a standing check inside each service that
 * participates. That is a rule you have to remember to apply, on a surface that
 * grows — and the way it fails is silent: a new endpoint simply does not have
 * it, and nothing anywhere says so.
 *
 * So the default is the other way round. Anything that changes state is refused
 * to a member who is not in good standing, and the handful of things a departed
 * member must still be able to do are named here. A new endpoint is refused
 * until somebody decides it belongs on this list, which is a decision made on
 * purpose rather than an omission nobody noticed.
 */

/** Statuses that may participate: contribute, fund goals, speak to the circle. */
export type MemberStanding = 'ACTIVE' | 'PENDING' | 'SUSPENDED' | 'RESIGNED' | string

export const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Paths a member out of good standing may still change things through.
 *
 * Each is here for a stated reason. Looking after your own account, and
 * stopping the system talking to you, are not participation.
 */
const SELF_CARE_PREFIXES = [
  // Securing the account they still hold. Someone who has left has more reason
  // to change their password, not less.
  '/api/v1/auth/change-password',
  // Turning the messages off. Refusing this would leave a departed member
  // receiving reminders with no way to stop them.
  '/api/v1/notifications/preferences',
  // Reading their own inbox is not participation, and marking a message read is
  // how reading works.
  '/api/v1/inbox',
  // Leaving, for anyone who has not finished doing so.
  '/api/v1/members/me/leave',
] as const

/** Whether this account may take part, as opposed to merely look. */
export function isInGoodStanding(status: MemberStanding): boolean {
  return status === 'ACTIVE'
}

/**
 * Whether a request must be refused because of who is making it.
 *
 * Reads are never refused here: the whole promise is that the history stays
 * theirs. Only state changes are gated, and only outside the self-care list.
 */
export function refuseForStanding(
  status: MemberStanding,
  method: string,
  pathname: string,
): boolean {
  if (isInGoodStanding(status)) return false
  if (!MUTATING_METHODS.has(method.toUpperCase())) return false
  return !SELF_CARE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** What to tell them. Written to be read by a person, not a log. */
export function standingRefusalMessage(status: MemberStanding): string {
  if (status === 'RESIGNED') {
    return 'You have left the Foundation, so this is no longer something you can do. Your account and your history stay yours — speak to a group admin if you would like to rejoin.'
  }
  if (status === 'SUSPENDED') {
    return 'Your membership is suspended, so this is not available right now. Speak to a group admin.'
  }
  return 'Your membership is not active yet, so this is not available. Speak to a group admin.'
}
