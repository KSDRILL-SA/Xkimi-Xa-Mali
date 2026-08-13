import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  MAX_MEMBERS, FOUNDER_COUNT, MIN_CONTRIBUTION_ZAR, MAX_CONTRIBUTION_ZAR,
  DEFAULT_INVITE_AMOUNT, MIN_GOAL_PAYMENT, MAX_GOAL_PAYMENT,
  PASSWORD_MIN_LENGTH, MAX_TRANSACTION_RETRY,
} from '@xxm/utils'

/**
 * Two promises the guide makes, guarded here because both have been broken
 * before.
 *
 * ── It must not go stale ────────────────────────────────────────────────────
 *
 * The first edition told members they could post to the community board ten
 * times a day, and nothing counted posts. A figure typed into a document drifts
 * from the rule it describes and nobody notices for months. So every amount is
 * imported from the part of the system that enforces it, and a number typed by
 * hand fails here rather than in somebody's inbox.
 *
 * ── It must not be written in the language of the system ────────────────────
 *
 * It is read by four brothers, three of whom do not work in software. A
 * revision of this document once explained the Foundation in terms of modules
 * and source files, with an appendix listing file paths. The vocabulary check
 * below is what stops that coming back the next time somebody edits it while
 * thinking about the code.
 *
 * Neither check renders the PDF. Extracting text from @react-pdf output means
 * parsing content streams, and the mistake is made in the source anyway.
 */

const source = readFileSync(resolve(__dirname, '../lib/pdf/founder-guide.tsx'), 'utf8')
const split = source.indexOf('export function FounderGuideDocument')

/** Imports, structure and the file comment. */
const preamble = source.slice(0, split)
/** The document — everything that reaches a reader. */
const body = source.slice(split)

const QUOTED = [
  'MAX_MEMBERS', 'FOUNDER_COUNT', 'MIN_CONTRIBUTION_ZAR', 'MAX_CONTRIBUTION_ZAR',
  'DEFAULT_INVITE_AMOUNT', 'MIN_GOAL_PAYMENT', 'MAX_GOAL_PAYMENT',
  'PASSWORD_MIN_LENGTH', 'NETCASH_FEE_BUFFER',
] as const

describe('the guide quotes the system rather than repeating it', () => {
  it.each(QUOTED)('imports %s instead of writing the number', (name) => {
    expect(preamble).toContain(name)
  })

  it.each(QUOTED)('uses %s somewhere a reader can see it', (name) => {
    // Imported but unused would pass the check above and mean nothing: the
    // figure on the page would still have been typed by hand.
    expect(body).toContain(name)
  })

  it('never writes a governed amount as a literal', () => {
    // The forms these would take if somebody wrote the number into a sentence.
    const forbidden = [
      `R${MIN_CONTRIBUTION_ZAR} `, `R${MIN_GOAL_PAYMENT} `, `R${DEFAULT_INVITE_AMOUNT} `,
      `${MAX_MEMBERS} people`, `${MAX_MEMBERS} members`, `${FOUNDER_COUNT} founders`,
      `${PASSWORD_MIN_LENGTH} characters`, `${MAX_TRANSACTION_RETRY} times`,
      MAX_CONTRIBUTION_ZAR.toLocaleString('en-ZA'), String(MAX_GOAL_PAYMENT),
    ]
    for (const literal of forbidden) {
      expect(body, `"${literal}" is typed in rather than quoted`).not.toContain(literal)
    }
  })
})

describe('it is written for the people who read it', () => {
  /**
   * Words that belong to the people who build the thing, not the people who
   * are being asked to trust it with money. Checked against the document only —
   * the file comment above it is written for whoever edits it next and may say
   * whatever it likes.
   */
  const JARGON = [
    'schema', 'repository', 'endpoint', 'API', 'middleware', 'validator',
    'packages/', 'apps/web', '.ts', 'constant', 'module', 'idempot',
    'database', 'migration', 'deploy', 'server', 'backend', 'frontend',
  ]

  /**
   * What a reader actually sees. Comments are stripped first — they are written
   * for whoever edits this next and may use any word they like — and then tags,
   * which removes component and prop names and leaves the prose, the table
   * cells and the labels.
   */
  const rendered = body
    .split('\n')
    .filter((l) => {
      const t = l.trimStart()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')
    .replace(/<[^>]*>/g, ' ')

  it.each(JARGON)('does not say %j to a reader', (word) => {
    // Whole words only for the plain ones. A substring match failed on
    // "capital", which contains "api", and the fix for that is not to stop
    // saying capital.
    const plain = /^[a-z]+$/i.test(word)
    const pattern = plain
      ? new RegExp(`\\b${word}`, 'i')
      : new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    expect(rendered).not.toMatch(pattern)
  })
})

describe('the contents and the pages it points at', () => {
  it('renders exactly the sections it declares, in order', () => {
    const declared = [...preamble.matchAll(/\{ num: (\d+), title: '/g)].map((m) => Number(m[1]))
    const rendered = [...body.matchAll(/<Section num=\{(\d+)\}/g)].map((m) => Number(m[1]))

    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered).toEqual(declared)
  })

  it('numbers them from one with no gaps', () => {
    const rendered = [...body.matchAll(/<Section num=\{(\d+)\}/g)].map((m) => Number(m[1]))
    expect(rendered).toEqual(rendered.map((_, i) => i + 1))
  })

  it('computes page numbers rather than printing typed ones', () => {
    // The contents prints a real page number against every section. Those are
    // derived from the same list the document is built from, so a section added
    // in the middle renumbers everything after it. A hand-written page number
    // would be right once and wrong forever after.
    expect(preamble).toMatch(/const PAGES = \(\(\) => \{/)
    expect(preamble).toContain('sectionPage.set')
    expect(body).not.toMatch(/page: \d+ \}/)
  })
})
