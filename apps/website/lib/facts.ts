import {
  FOUNDER_COUNT,
  MAX_MEMBERS,
  MIN_CONTRIBUTION_ZAR,
  MAX_CONTRIBUTION_ZAR,
} from '@xxm/utils'

/**
 * Every fact about the Foundation that the public site states, derived rather
 * than typed.
 *
 * The site used to carry these as literals: "R100+ / Month" in the hero, "four
 * brothers" in five separate pieces of copy, and a member count of 4 hardcoded
 * into the stats fallback. All of them happened to be right, which is the
 * problem — the day somebody raises the minimum contribution in `constants.ts`,
 * the marketing site keeps quoting the old figure to the public and nothing
 * anywhere disagrees.
 *
 * `constants.ts` is where these live and the system enforces them there: a
 * contribution below the minimum is rejected, the fiftieth seat is refused, a
 * fifth founder cannot be created. This module is the one place the public site
 * reads them, so the page and the rule can never drift apart.
 *
 * Two claims were removed rather than derived, because they were not facts:
 * "100% Automated Collections" sat in a grid of live figures, implying it was
 * measured, while the audit log records manual payments and Netcash has never
 * run; and "DebiCheck Verified" claimed a credential the Foundation does not
 * hold. A number you cannot source is not a statistic, it is a wish.
 */

/** Spelled out, because prose reads "four brothers" and not "4 brothers". */
const WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
] as const

function spell(n: number): string {
  return WORDS[n] ?? String(n)
}

/**
 * `R100`, `R10\u00a0000` (rendered R10 000) — South African convention, a space and not a comma.
 *
 * Grouped by hand rather than through `toLocaleString('en-ZA')`, which returns a
 * non-breaking space on some ICU builds and a plain one on others. Two machines
 * rendering the same figure differently is a small thing until a test compares
 * them and prints two strings that look identical.
 *
 * The separator is deliberately U+00A0. A comma reads as a decimal point to a
 * South African, and a plain space lets "R10" and "000" land on separate lines
 * — on a page about money, neither is acceptable.
 */
const THIN_GAP = '\u00a0'

function rand(amount: number): string {
  const grouped = String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, THIN_GAP)
  return `R${grouped}`
}

export const FACTS = {
  /** How many founders there are, as a word: "four". */
  founderWord: spell(FOUNDER_COUNT),
  /** The same word starting a sentence: "Four". Kept here rather than done with
   *  string surgery at the call site, where indexing a string trips
   *  `noUncheckedIndexedAccess` and the fix is noisier than the sentence. */
  founderWordCapitalised: spell(FOUNDER_COUNT).replace(/^./, (c) => c.toUpperCase()),
  founderCount: FOUNDER_COUNT,

  /** The size of the circle. A design decision, not a limit to escape. */
  memberCap: MAX_MEMBERS,

  /** "R100" — the least a member may contribute in a month. */
  minMonthly: rand(MIN_CONTRIBUTION_ZAR),
  /** "R10 000" — the most. */
  maxMonthly: rand(MAX_CONTRIBUTION_ZAR),

  /** "R100+" — what the hero pill says, without stating a ceiling. */
  minMonthlyPlus: `${rand(MIN_CONTRIBUTION_ZAR)}+`,
} as const
