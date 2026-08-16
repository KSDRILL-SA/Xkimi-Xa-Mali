import {
  FOUNDER_COUNT,
  MAX_MEMBERS,
  MIN_CONTRIBUTION_ZAR,
  MAX_CONTRIBUTION_ZAR,
} from './constants'

/**
 * Every fact about the Foundation that any app states in prose, derived rather
 * than typed.
 *
 * The constants next door are the rules, and the system enforces them there: a
 * contribution below the minimum is rejected, the fiftieth seat is refused, a
 * fifth founder cannot be created. What was missing was a way to *say* them.
 * Prose does not read "4 brothers" or "R10000", so every page that needed to
 * mention one wrote it out by hand — and a handwritten number is no longer
 * connected to the rule it came from.
 *
 * It was written out in a lot of places. "four brothers" and "four men" across
 * the public site and the member app's about page and login screen; "R100+ /
 * Month" in a hero; the founder guide's cover blurb, in a PDF that is generated
 * from the constants everywhere except there. All of them happened to be
 * correct, which is exactly the danger: they are correct until somebody edits
 * `constants.ts`, and then they are wrong everywhere at once with nothing
 * anywhere disagreeing.
 *
 * This module lives beside the constants rather than in any one app because
 * three apps make the same statements about the same Foundation. A copy per app
 * is the original problem again with extra steps.
 *
 * Note what is deliberately absent: anything measured. Member counts, pooled
 * totals and months active are database facts, they change without a deploy,
 * and they belong to whatever aggregates them — not here. A number that can only
 * be known by asking the database must never be available as a constant, or
 * somebody will use the constant.
 */

/** Spelled out, because prose reads "four brothers" and not "4 brothers". */
const WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
] as const

function spell(n: number): string {
  return WORDS[n] ?? String(n)
}

/**
 * The thousands separator, as an escape rather than the character itself.
 *
 * U+00A0, deliberately: a comma reads as a decimal point to a South African, and
 * a plain space lets "R10" and "000" wrap onto separate lines. On a page about
 * money neither is acceptable.
 *
 * Written `\u00a0` because an invisible character in source is a hazard in its
 * own right. A test comparing against a typed one failed with "expected 'R10
 * 000' to be 'R10 000'" — two strings identical on screen and different in
 * memory. Escaped, there is nothing to misread.
 */
const GROUP_SEPARATOR = '\u00a0'

/**
 * `R100`, `R10 000` — grouped by hand rather than by `toLocaleString('en-ZA')`,
 * which returns a non-breaking space on some ICU builds and a plain one on
 * others. Two machines rendering the same figure differently is a small thing
 * until one of them is a server and the other is the browser rehydrating it.
 */
function rand(amount: number): string {
  const grouped = String(Math.round(amount)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    GROUP_SEPARATOR,
  )
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

  /** "R100+" — for a pill that states a floor without implying a ceiling. */
  minMonthlyPlus: `${rand(MIN_CONTRIBUTION_ZAR)}+`,
} as const
