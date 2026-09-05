/**
 * The reference a collections provider echoes back, and the payer sees on their
 * bank statement.
 *
 * ── Why this is one function and not four string literals ──────────────────
 *
 * There were four, and no two agreed:
 *
 *     debit run             XXM-2026-09
 *     manual payment        XXM-2026-09
 *     delayed debit         XXM-2026-09-DELAY
 *     retry                 XXM-RETRY-a1b2c3d4
 *     mandate registration  XXM-A1B2C3D4        <- the only correct one
 *
 * Three encode the period, one encodes the transaction, and only the mandate's
 * identifies the payer. Which means the reference the payer authenticated at
 * their bank was not the reference any collection actually carried.
 *
 * ── What the provider contract requires ────────────────────────────────────
 *
 * From Netcash's Appendix A, and these are not preferences:
 *
 *   §3.3   the Payment Instruction must be identifiable by a unique Abbreviated
 *          Short Name and a unique **Contract/Agreement Reference between the
 *          Client and its Customer** — so it identifies the *payer*, not the
 *          period;
 *   §10.3  it must reflect on the Customer's bank statement;
 *   §11.1  it is a primary key for Stop Payments, and clients are prohibited
 *          from changing it to circumvent them;
 *   §18.9  once a Payment Instruction has been presented, it **cannot be
 *          changed for the duration of the Contract**.
 *
 * A period-based reference fails all four. It is identical across members, so a
 * load report keyed on it cannot be attributed to anyone (A1-F03); and it
 * changes every month, which §18.9 forbids outright once collections start.
 *
 * ── Why it is derived rather than stored ───────────────────────────────────
 *
 * Derived from the member's own id, so it is the same value everywhere it is
 * computed and cannot drift between the mandate and the collection. Nothing has
 * to remember it, migrate it, or keep two copies in step — which is the failure
 * mode that produced four different references in the first place.
 *
 * It is also permanent by construction, which is what §18.9 needs: a member's id
 * does not change, so neither does this.
 *
 * ── The shape ──────────────────────────────────────────────────────────────
 *
 * `XXM-` plus the last eight characters of the member's id, upper-cased. Well
 * inside the 22 characters the batch file truncates to, and recognisable on a
 * bank statement as belonging to this Foundation.
 *
 * cuid ids share a prefix and differ in their tail, so the *last* eight
 * characters are the ones that distinguish members — taking the first eight
 * would give every member the same reference.
 */
export function collectionReference(userId: string): string {
  return `XXM-${userId.slice(-8).toUpperCase()}`
}

/** The provider truncates the account reference to this many characters. */
export const COLLECTION_REFERENCE_MAX_LENGTH = 22
