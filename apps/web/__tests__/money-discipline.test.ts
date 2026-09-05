import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { roundZAR, sumZAR, subtractZAR, multiplyZAR, percentZAR } from '@/lib/money'

// ---------------------------------------------------------------------------
// The money-handling contract, held by something other than a comment.
//
// `lib/money.ts` opens with the rule, and it is a good rule:
//
//     never write `a + b`, `a - b`, or `x * n` on rand amounts directly —
//     use sumZAR / subtractZAR / roundZAR.
//
// Storage is exact `DECIMAL(12,2)` and aggregation is exact and Postgres-side,
// so the hazard is narrow: *chained* JS arithmetic accumulating float dust
// (0.1 + 0.2 → 0.30000000000000004). The helpers round each result back to two
// decimals, which makes that impossible — as long as everything goes through
// them.
//
// Until now, "as long as" was enforced by a comment. This repository has
// already been caught twice by exactly that: a comment claiming the manual
// payment path claimed its intent before calling the gateway when it did not,
// and a guard whose comment described a check wider than the one it made. A
// convention held only by prose is a convention until somebody is in a hurry.
//
// Writing this found four violations, which is the argument for it:
//
//   - budget.service      `mandateAmount - budgetAmount`   (shown to a member)
//   - report.service      `totalDue - totalPaid`           (headline of the admin report)
//   - insights.service    `ytd + monthly * remainingMonths`(a member's projection)
//   - goal-engagement     `Math.round(amount * 100) / 100` (a hand-rolled roundZAR,
//                                                           missing its EPSILON nudge)
//
// The last is the interesting one. It is not sloppy — it is a correct-looking
// copy of the helper that rounds *differently* at a .xx5 boundary, so the same
// amount could round two ways depending on which file handled it.
//
// And the third exposed a gap in the contract itself: it banned `x * n` and
// offered nothing to write instead, so the projection routed around it. A rule
// with no replacement for the thing it bans is a rule people step over;
// `multiplyZAR` now exists.
// ---------------------------------------------------------------------------

const WEB = path.resolve(__dirname, '..')

/** The financial path. Components format money; these decide it. */
const ROOTS = ['services', 'inngest', 'repositories', 'app/api'] as const

/**
 * An identifier holding rand.
 *
 * Anything containing "amount", plus the names this codebase uses for a rand
 * figure. Deliberately a list rather than a guess: `total` alone is usually a
 * row count, and flagging `totalPages - 1` would make this noise.
 */
const MONEY_NAMES = [
  'totalDue', 'totalPaid', 'outstanding', 'overage', 'poolTotal',
  'credited', 'debited', 'balance', 'instalment', 'contributed', 'payout',
]

const isMoney = (id: string): boolean =>
  /amount/i.test(id) || MONEY_NAMES.includes(id.split('.').pop() ?? '')

/** Anything that already routes the arithmetic through the contract. */
const HELPERS =
  /\b(roundZAR|sumZAR|subtractZAR|multiplyZAR|percentZAR|splitZAR|splitByWeightsZAR|toCents|fromCents|debitAmountWithFee)\b/

/**
 * `X op Y`, where the operator is arithmetic rather than part of `+=`, `--`,
 * `=>` or similar. A character class rather than a nested group, because the
 * obvious version of this regex backtracks catastrophically on a long line.
 */
const ARITHMETIC = /([A-Za-z0-9_$.]+)[ \t]*([-+*])[ \t]*(?![-+=>])/g

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...tsFiles(full))
    else if (full.endsWith('.ts')) out.push(full)
  }
  return out
}

/** Comments are prose about arithmetic, not arithmetic. */
const stripComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')

function violations(): string[] {
  const found: string[] = []

  for (const root of ROOTS) {
    for (const file of tsFiles(path.join(WEB, root))) {
      // The helpers themselves are where the arithmetic is supposed to be.
      if (path.basename(file) === 'money.ts') continue

      stripComments(readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
        if (HELPERS.test(line)) return

        ARITHMETIC.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = ARITHMETIC.exec(line))) {
          if (!isMoney(m[1]!)) continue
          found.push(`${path.relative(WEB, file)}:${i + 1}  ${line.trim().slice(0, 90)}`)
          return
        }
      })
    }
  }

  return found
}

describe('money arithmetic goes through the helpers', () => {
  it('no raw + - or * on a rand value anywhere in the financial path', () => {
    // A heuristic, and it says so: it reads names, not types. It cannot see a
    // rand amount called `x`, and it will not try to. What it does cover is the
    // shape every one of the four real violations took — a money-named
    // identifier with an operator beside it and no helper on the line.
    expect(violations()).toEqual([])
  })

  it('is actually looking at something', () => {
    // A scanner whose roots are wrong reports a clean bill of health forever.
    const scanned = ROOTS.flatMap((r) => tsFiles(path.join(WEB, r)))
    expect(scanned.length).toBeGreaterThan(50)
  })

  it('would catch the violations it was written for', () => {
    // Verified against the real thing before it was fixed; this keeps that
    // proof in the file, so a later edit cannot quietly defang the check.
    const line = '    overage: mandateAmount - budgetAmount,'
    ARITHMETIC.lastIndex = 0
    const m = ARITHMETIC.exec(line)

    expect(m).not.toBeNull()
    expect(isMoney(m![1]!)).toBe(true)
    expect(HELPERS.test(line)).toBe(false)
  })

  it('does not flag arithmetic that already uses a helper', () => {
    expect(HELPERS.test('outstanding: subtractZAR(totalDue, totalPaid),')).toBe(true)
  })

  it('does not flag a row count that happens to be called total', () => {
    expect(isMoney('totalPages')).toBe(false)
    expect(isMoney('totalCount')).toBe(false)
  })
})

describe('the helpers behave as the contract claims', () => {
  it('eliminates float dust', () => {
    expect(sumZAR(0.1, 0.2)).toBe(0.3)
    expect(0.1 + 0.2).not.toBe(0.3)
  })

  it('rounds half up at the cent boundary', () => {
    // The Number.EPSILON nudge. `Math.round(1.005 * 100) / 100` gives 1.00,
    // because 1.005 is really 1.00499999999999989 — which is exactly what the
    // hand-rolled copy in goal-engagement was doing.
    expect(roundZAR(1.005)).toBe(1.01)
    expect(Math.round(1.005 * 100) / 100).toBe(1)
  })

  it('never returns negative zero', () => {
    // `-0` serialises as `-0` and reads as a defect on a statement.
    expect(Object.is(subtractZAR(5, 5), -0)).toBe(false)
    expect(subtractZAR(5, 5)).toBe(0)
  })

  it('multiplies a rand amount by a count', () => {
    expect(multiplyZAR(450.5, 3)).toBe(1351.5)
    expect(multiplyZAR(0.1, 3)).toBe(0.3)
  })

  it('takes a percentage as the human figure, not a fraction', () => {
    expect(percentZAR(200, 7.5)).toBe(15)
  })
})
