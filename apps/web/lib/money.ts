// ─── Money handling contract (BACKEND-B12) ──────────────────────────────────
//
// Source of truth for money is the database: DECIMAL(12,2)/(10,2) columns and
// Postgres-side aggregation (`_sum`), both of which are exact. Money crosses
// into JavaScript as a `number` only at the service boundary — for display,
// comparison, and the occasional small computation.
//
// IEEE-754 doubles represent every 2-decimal rand value in the platform's range
// (up to the DECIMAL(12,2) ceiling) with far more than enough precision, and the
// database rounds to scale 2 on write, so persisted money is never wrong. The
// one real hazard is *chained* JS arithmetic accumulating float dust
// (0.1 + 0.2 → 0.30000000000000004). To make that impossible, every money
// arithmetic operation in JS MUST go through these helpers, which round each
// result back to 2 decimal places deterministically.
//
// Rule of thumb: never write `a + b`, `a - b`, or `x * n` on rand amounts
// directly — use sumZAR / subtractZAR / roundZAR. Aggregation of many rows still
// belongs in the database (`_sum`), not a JS reduce.

/** Round a rand amount to 2 decimal places, eliminating binary-float dust. */
export function roundZAR(amount: number): number {
  // + Number.EPSILON nudges values sitting a hair below .xx5 up to the correct
  // half-up boundary (e.g. 1.005 → 1.01) before truncation by Math.round.
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

/** Sum rand amounts, rounded to 2 decimals. */
export function sumZAR(...amounts: number[]): number {
  return roundZAR(amounts.reduce((total, amount) => total + amount, 0))
}

/** `a - b`, rounded to 2 decimals (never negative-zero). */
export function subtractZAR(a: number, b: number): number {
  return roundZAR(a - b) || 0
}

/**
 * A percentage of a rand amount, rounded to the cent — e.g. a fee, a penalty, or
 * interest. `percent` is the human figure, not a fraction: percentZAR(200, 7.5)
 * is R15.00 (7.5% of R200), not 0.075%.
 *
 * For a single derived charge this is all you need. If you are apportioning a
 * whole amount across several shares that must still sum back to the original
 * (e.g. splitting a payout), use splitZAR (equal) — a weighted variant can be
 * added alongside it when proportional payouts arrive — so no cent is lost.
 */
export function percentZAR(amount: number, percent: number): number {
  return roundZAR((amount * percent) / 100)
}

/**
 * Split a rand amount into `parts` equal shares without losing or inventing a
 * cent. Naive division fails here — R100 / 3 is R33.33 three times (R99.99, a
 * cent short) or R33.34 (R100.02, a cent over). This uses penny allocation: each
 * share gets floor(cents / parts), then the leftover cents are handed out one at
 * a time to the earliest shares. Guarantees:
 *   • the returned shares sum back to `amount` exactly, and
 *   • any two shares differ by at most one cent.
 * Works for negative amounts (e.g. a reversal) too. Order is deterministic —
 * earlier shares carry the extra cent — so callers can assign it fairly (e.g.
 * rotate who is "first" each period).
 *
 * splitZAR(100, 3) -> [33.34, 33.33, 33.33]   (sum 100.00)
 * splitZAR(10, 4)  -> [2.5, 2.5, 2.5, 2.5]
 */
export function splitZAR(amount: number, parts: number): number[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new Error(`splitZAR: parts must be a positive integer, received ${parts}`)
  }

  const totalCents = Math.round(amount * 100)
  const base = Math.trunc(totalCents / parts)
  const remainder = totalCents - base * parts // signed leftover cents to hand out
  const extra = Math.sign(remainder)
  const extraCount = Math.abs(remainder)

  const shares: number[] = []
  for (let i = 0; i < parts; i++) {
    const cents = base + (i < extraCount ? extra : 0)
    shares.push(cents / 100)
  }
  return shares
}
