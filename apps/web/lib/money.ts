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
