/**
 * The lock that makes "at least one admin" an invariant rather than a hope.
 *
 * ── What was wrong ─────────────────────────────────────────────────────────
 *
 * `role-policy` and `status-policy` decide correctly whether a change may
 * proceed, and both are shared by the two apps so neither gets its own opinion.
 * What neither could fix is *when* the decision is made. Every caller did:
 *
 *     count the admins  ->  ask the policy  ->  write
 *
 * with nothing holding the three together. Two admins acting at the same moment
 * both read 2, both are told 2 is enough, and both write:
 *
 *     Admin A: remove B          Admin B: remove A
 *       reads adminCount = 2       reads adminCount = 2
 *       policy: allowed            policy: allowed
 *       deletes B's role           deletes A's role
 *                    -> ACTIVE ADMINS = 0
 *
 * Each operation was individually legitimate and individually permitted. The
 * system still ends with nobody able to sign into the console, no way to grant
 * the role back — granting requires an admin — and no way out but editing the
 * database by hand. A correct rule evaluated against a stale read is not an
 * invariant.
 *
 * ── Why a lock and not a stricter check ────────────────────────────────────
 *
 * There is no check that fixes this. The count is right when it is taken and
 * wrong by the time it is used, and that gap cannot be closed by counting more
 * carefully or by re-counting after the write: under READ COMMITTED each
 * transaction sees its own delete and not the other's, so both still conclude
 * that one admin remains.
 *
 * SERIALIZABLE would detect it, at the cost of making every caller handle
 * serialisation failures and retries for an operation performed a few times a
 * year. A transaction-scoped advisory lock is the smaller instrument: the
 * second operation waits for the first to commit, then counts and sees the
 * truth. Postgres releases it at commit or rollback, so a crashed request
 * cannot leave the console locked.
 *
 * ── Why every path must take the same lock ─────────────────────────────────
 *
 * Two different operations can break this one invariant, and they do not see
 * each other: revoking somebody's ADMIN role, and suspending an admin's
 * account. One admin revoking B's role while another suspends A passes both
 * checks — each is looking at a different table. So the lock is named for the
 * *invariant*, not for the operation, and every path that could reduce the
 * number of usable admins takes it.
 *
 * ── Dependency-free on purpose ─────────────────────────────────────────────
 *
 * Typed structurally rather than against Prisma, for the same reason the two
 * policy modules are pure: this package is imported by both apps and by the
 * website, and a rule that lives where only one app can reach it is how the
 * original defect happened.
 */

/**
 * Namespace for this project's advisory locks. Arbitrary but fixed — two
 * unrelated locks sharing a pair would serialise against each other silently.
 */
export const XXM_LOCK_NAMESPACE = 4710

/** The admin-availability invariant: at least one admin can always sign in. */
export const ADMIN_INVARIANT_LOCK = 1

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
 * Hold the admin-availability invariant for the rest of this transaction.
 *
 * Must be the **first** statement in the transaction that will count admins and
 * write. Taking it after the count would lock nothing that matters: the stale
 * read has already happened.
 *
 * Uses the two-integer form of `pg_advisory_xact_lock` deliberately — the
 * single-argument form takes a bigint, and a JavaScript number crossing that
 * boundary is a cast waiting to be got wrong.
 */
export async function lockAdminInvariant(tx: AdvisoryLockClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${XXM_LOCK_NAMESPACE}, ${ADMIN_INVARIANT_LOCK})`
}
