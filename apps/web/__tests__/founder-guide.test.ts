import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  MAX_MEMBERS, FOUNDER_COUNT, MIN_CONTRIBUTION_ZAR, MAX_CONTRIBUTION_ZAR,
  MIN_GOAL_PAYMENT, MAX_GOAL_PAYMENT, PASSWORD_MIN_LENGTH, MAX_TRANSACTION_RETRY,
  CONTRIBUTION_STEP_ZAR, DEFAULT_INVITE_AMOUNT,
} from '@xxm/utils'

/**
 * The guide opens by telling members that its figures are quoted from the system
 * rather than typed into a document, and Appendix B lists each one against the
 * module it was read from. That is a claim the document makes about itself, in
 * writing, to people who are handing it money.
 *
 * The previous edition made a smaller claim of the same kind — ten posts a day
 * on the community board — and nothing enforced it, so for months a signed
 * document said something the software would not do. This is what stops that
 * recurring: the guide is checked against the constants, and a figure typed in
 * by hand fails here rather than in somebody's inbox.
 *
 * ── What this deliberately does not do ──────────────────────────────────────
 *
 * It does not render the PDF and read the text back. Extracting text from
 * @react-pdf output means parsing content streams, and a test that needs a PDF
 * parser to assert "the number 50 is in here" is a test nobody will maintain.
 * The source is where the mistake would be made, so the source is what is read.
 */

const GUIDE = resolve(__dirname, '../lib/pdf/founder-guide.tsx')
const source = readFileSync(GUIDE, 'utf8')

/** Everything above the JSX — imports, constants, the file comment. */
const preamble = source.slice(0, source.indexOf('export function FounderGuideDocument'))
/** The document itself, where a hardcoded figure would actually reach a reader. */
const body = source.slice(source.indexOf('export function FounderGuideDocument'))
/** The parts a member reads as prose, and the citation list that backs them. */
const prose = body.slice(0, body.indexOf('APPENDIX B'))
const appendix = body.slice(body.indexOf('APPENDIX B'))

describe('the guide quotes the system rather than repeating it', () => {
  const quoted: [string, number][] = [
    ['MAX_MEMBERS', MAX_MEMBERS],
    ['FOUNDER_COUNT', FOUNDER_COUNT],
    ['MIN_CONTRIBUTION_ZAR', MIN_CONTRIBUTION_ZAR],
    ['MAX_CONTRIBUTION_ZAR', MAX_CONTRIBUTION_ZAR],
    ['CONTRIBUTION_STEP_ZAR', CONTRIBUTION_STEP_ZAR],
    ['DEFAULT_INVITE_AMOUNT', DEFAULT_INVITE_AMOUNT],
    ['MIN_GOAL_PAYMENT', MIN_GOAL_PAYMENT],
    ['MAX_GOAL_PAYMENT', MAX_GOAL_PAYMENT],
    ['PASSWORD_MIN_LENGTH', PASSWORD_MIN_LENGTH],
    ['MAX_TRANSACTION_RETRY', MAX_TRANSACTION_RETRY],
    ['NETCASH_FEE_BUFFER', -1], // read from group-account, not a fixed value
  ]

  it.each(quoted)('imports %s instead of writing the number', (name) => {
    expect(preamble).toContain(name)
  })

  it.each(quoted)('interpolates %s somewhere a reader can see it', (name) => {
    // Present in the imports but never used would satisfy the check above and
    // mean nothing — the figure on the page would still have been typed.
    //
    // Read from the prose only, with the appendix cut off. Appendix B names
    // every constant as a *string*, so checking the whole body would pass for a
    // figure that appears nowhere except in its own citation.
    expect(prose).toContain(name)
  })

  it('lists every quoted figure in Appendix B', () => {
    // The appendix is the evidence for the claim on the first page. A figure
    // quoted in the document but missing from the appendix makes that page
    // slightly untrue, which is exactly the failure being guarded against.
    for (const [name] of quoted) {
      expect(appendix, `${name} is quoted but not listed in Appendix B`).toContain(name)
    }
  })
})

describe('figures that must never be typed', () => {
  /**
   * The literal forms of each constant, as they would appear if somebody wrote
   * the number into a sentence instead of interpolating it. Checked against the
   * JSX only: the appendix rows name the modules, and the file comment quotes
   * the values while explaining them, which are both fine.
   */
  const forbidden = [
    `R${MIN_CONTRIBUTION_ZAR} `,
    `R${MIN_GOAL_PAYMENT} `,
    `${MAX_MEMBERS} people`,
    `${MAX_MEMBERS} seats`,
    `${PASSWORD_MIN_LENGTH} characters`,
  ]

  it.each(forbidden)('does not contain the literal %j', (literal) => {
    expect(body).not.toContain(literal)
  })
})

describe('the contents page and the document agree', () => {
  it('declares exactly the sections it renders', () => {
    // PARTS drives the contents page, the five dividers and nothing else. A
    // section rendered without an entry there is a section missing from the
    // contents, which is how the first edition ended up describing a system it
    // no longer matched.
    const declared = [...preamble.matchAll(/\{ num: (\d+), title: '/g)].map((m) => Number(m[1]))
    const rendered = [...body.matchAll(/<Section num=\{(\d+)\}/g)].map((m) => Number(m[1]))

    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered).toEqual(declared)
  })

  it('numbers them from one with no gaps', () => {
    const rendered = [...body.matchAll(/<Section num=\{(\d+)\}/g)].map((m) => Number(m[1]))
    expect(rendered).toEqual(rendered.map((_, i) => i + 1))
  })
})
