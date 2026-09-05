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
 * A rand amount taken `times` over — a monthly figure across n months, a unit
 * price across n units.
 *
 * The contract above forbids `x * n` on rand amounts and, until this existed,
 * offered nothing to write instead. A rule with no replacement for the thing it
 * bans is a rule people route around: the projection on the member insights
 * page did exactly that, computing `yearToDatePaid + monthlyAmount * remaining`
 * in the open.
 *
 * `times` is a count, not money — so this is deliberately not `sumZAR` called n
 * times, which would be the same answer arrived at slowly.
 */
export function multiplyZAR(amount: number, times: number): number {
  return roundZAR(amount * times)
}

/**
 * A percentage of a rand amount, rounded to the cent — e.g. a fee, a penalty, or
 * interest. `percent` is the human figure, not a fraction: percentZAR(200, 7.5)
 * is R15.00 (7.5% of R200), not 0.075%.
 *
 * For a single derived charge this is all you need. If you are apportioning a
 * whole amount across several shares that must still sum back to the original
 * (e.g. splitting a payout), use splitZAR (equal shares) or splitByWeightsZAR
 * (proportional shares) so no cent is lost or invented.
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

/**
 * Apportion a rand amount across recipients by weight, without losing or
 * inventing a cent — the proportional generalisation of splitZAR (equal weights
 * give the same result). This is the building block for a payout / dividend
 * split: weight each member by their contribution share and the pot is divided
 * exactly, to the cent.
 *
 * Largest-remainder (Hamilton) allocation: each recipient first gets the floor
 * of its exact proportional cents; the leftover cents are then handed out one at
 * a time to the recipients with the largest fractional remainders (ties broken
 * by position, so the result is deterministic). Guarantees:
 *   • the returned shares sum back to `amount` exactly,
 *   • a larger weight never receives a smaller share, and
 *   • a zero weight receives R0.00.
 * Works for negative amounts (e.g. reversing a distribution).
 *
 * splitByWeightsZAR(100, [1, 1, 1])   -> [33.34, 33.33, 33.33]  (sum 100.00)
 * splitByWeightsZAR(100, [50, 30, 20]) -> [50, 30, 20]
 * splitByWeightsZAR(100, [1, 0, 1])    -> [50, 0, 50]
 *
 * If every weight is zero there is no basis to apportion by, so the amount is
 * split equally rather than dropped — cents are always conserved.
 */
export function splitByWeightsZAR(amount: number, weights: number[]): number[] {
  if (weights.length === 0) {
    throw new Error('splitByWeightsZAR: weights must not be empty')
  }
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new Error('splitByWeightsZAR: weights must be non-negative finite numbers')
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0)
  if (totalWeight === 0) return splitZAR(amount, weights.length)

  const totalCents = Math.round(amount * 100)
  const exact = weights.map((w) => (totalCents * w) / totalWeight)
  const cents = exact.map((c) => Math.floor(c))
  let leftover = totalCents - cents.reduce((sum, c) => sum + c, 0)

  // Rank by fractional remainder (desc), ties broken by original position, and
  // give the leftover cents to the top `leftover` recipients.
  const ranked = exact
    .map((c, i) => ({ i, frac: c - Math.floor(c) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)

  for (let k = 0; k < ranked.length && leftover > 0; k++) {
    cents[ranked[k]!.i]! += 1
    leftover--
  }

  return cents.map((c) => c / 100)
}
