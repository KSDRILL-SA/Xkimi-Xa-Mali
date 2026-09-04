/**
 * The locks that make this system's counting rules invariants rather than hopes.
 *
 * ── The shape of the bug these exist for ───────────────────────────────────
 *
 * Several rules in this system are of the form *"no more than N of X"*, and
 * every one of them was written the same way:
 *
 *     count the X  ->  ask the rule  ->  write
 *
 * with nothing holding the three together. Two requests arriving at the same
 * moment both read a number that permits them, are both told yes, and both
 * write. Each operation is individually legitimate and individually permitted;
 * the pair breaks the rule. Counting is not reserving, and a correct rule
 * evaluated against a stale read is not an invariant.
 *
 * ── Why a lock and not a stricter check ────────────────────────────────────
 *
 * There is no check that fixes this. The count is right when it is taken and
 * wrong by the time it is used, and re-counting after the write does not help:
 * under READ COMMITTED each transaction sees its own write and not the other's,
 * so both still conclude the rule holds.
 *
 * SERIALIZABLE would detect it, at the cost of making every caller handle
 * serialisation failures and retries — for operations performed a few times a
 * year, by two people. A transaction-scoped advisory lock is the smaller
 * instrument: the second caller waits for the first to commit, then counts and
 * sees the truth. Postgres releases it at commit or rollback, so a refusal or a
 * crashed request cannot leave the rule locked shut.
 *
 * ── Locks are named for invariants, not for operations ─────────────────────
 *
 * This is the part that is easy to get wrong, and getting it wrong looks
 * exactly like getting it right.
 *
 * More than one operation can break a single rule, and those operations do not
 * see each other: revoking somebody's ADMIN role reads `user_roles`, while
 * suspending an admin's account reads `users`. One admin doing each at the same
 * moment passes both checks. Issuing an invitation and accepting one both
 * consume a place in the circle, and they count different things — issue counts
 * members plus pending invitations, acceptance counts members only.
 *
 * So every operation that can consume the *same* resource takes the *same*
 * lock, even when the queries have nothing in common. A lock per operation
 * would serialise each operation against itself and nothing against its
 * sibling, which is the original defect wearing a lock.
 *
 * ── Dependency-free on purpose ─────────────────────────────────────────────
 *
 * Typed structurally rather than against Prisma, for the same reason
 * `role-policy` and `status-policy` are pure: this package is imported by both
 * apps, and a rule that lives where only one app can reach it is how these
 * defects happened in the first place.
 */

/**
 * Namespace for this project's advisory locks. Arbitrary but fixed.
 *
 * Every lock below shares it and is distinguished by its own id, so that the
 * whole set is visible in one place. Two unrelated invariants that happened to
 * pick the same pair would serialise against each other with nothing to show
 * for it — no error, no deadlock, just two operations mysteriously queueing.
 */
export const XXM_LOCK_NAMESPACE = 4710

/**
 * The locks, and the invariant each one protects. Add here, never inline —
 * a number chosen at a call site is a collision waiting to happen.
 */
export const INVARIANT_LOCK = {
  /**
   * At least one admin can always sign in.
   *
   * Taken by: revoking an ADMIN role, and suspending an admin's account, in
   * both apps. See `role-policy` and `status-policy` for the rule itself.
   */
  ADMIN_AVAILABILITY: 1,

  /**
   * No more than {@link MAX_MEMBERS} places in the circle are occupied or held.
   *
   * Taken by: issuing an invitation, and accepting one. The two count
   * differently on purpose — an invitee accepting already holds a place, so
   * counting their own invitation would refuse them their own seat — but they
   * draw from the same fifty, so they take the same lock.
   */
  MEMBER_CAP: 2,
} as const

export type InvariantLock = (typeof INVARIANT_LOCK)[keyof typeof INVARIANT_LOCK]

/**
 * The bit of a Prisma transaction client this needs, and nothing more.
 *
 * `$executeRaw` rather than `$executeRawUnsafe`: both arguments are our own
 * integer constants and could not carry injection, but a raw-SQL helper that
 * takes the unsafe variant is an invitation to pass something else to it later.
 */
export interface AdvisoryLockClient {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>
}

/**
 * Hold an invariant for the rest of this transaction.
 *
 * Must be the **first** statement in the transaction that will count and write.
 * Taking it after the count locks nothing that matters: the stale read has
 * already happened.
 *
 * Uses the two-integer form of `pg_advisory_xact_lock` deliberately — the
 * single-argument form takes a bigint, and a JavaScript number crossing that
 * boundary is a cast waiting to be got wrong.
 */
export async function holdInvariant(
  tx: AdvisoryLockClient,
  lock: InvariantLock,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${XXM_LOCK_NAMESPACE}, ${lock})`
}

/** Hold the admin-availability invariant. See {@link INVARIANT_LOCK}. */
export function lockAdminInvariant(tx: AdvisoryLockClient): Promise<void> {
  return holdInvariant(tx, INVARIANT_LOCK.ADMIN_AVAILABILITY)
}

/** Hold the member-cap invariant. See {@link INVARIANT_LOCK}. */
export function lockMemberCap(tx: AdvisoryLockClient): Promise<void> {
  return holdInvariant(tx, INVARIANT_LOCK.MEMBER_CAP)
}
