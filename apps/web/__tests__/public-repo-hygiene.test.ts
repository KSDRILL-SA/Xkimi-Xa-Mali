import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// This repository is PUBLIC. These are the things that must not be written into
// it, held as tests rather than as a rule somebody has to remember.
//
// ── What happened ─────────────────────────────────────────────────────────
//
// The Foundation's live ABSA account number sat in the source from 2026-06-11,
// and in September it was copied into `.env.example` and `DEPLOYMENT.md` while
// documenting the environment variables that hold it — the number was already
// in a tracked file, so putting it in two more felt like documentation rather
// than disclosure. It was disclosure. The Capitec account of KSDRILL SA went
// the same way through the constitution, and an owner's mobile number through
// an "e.g." in a config reference.
//
// In South Africa an account number together with a branch code has been enough
// to attempt an unauthorised debit order. That is the specific harm.
//
// ── Why these tests are shaped oddly ──────────────────────────────────────
//
// A test that guarded the real values by listing them would put them back in a
// public file — with a comment explaining their significance, which is worse
// than where we started. So nothing here contains a real account number, branch
// code or phone number. Every check matches on SHAPE, in the places those
// values are most likely to reappear.
//
// ── What is deliberately NOT covered ──────────────────────────────────────
//
// Git history. These values were public for months and history is not rewritten
// here — treat both accounts as disclosed and defend them at the bank, not in a
// test. This stops the leak spreading; it cannot retract it.
//
// Founder names, photos and bios are also in the repository, deliberately: they
// are on the public marketing site. Not every piece of personal data here is a
// mistake, and a check that flagged them would be noise.
// ---------------------------------------------------------------------------

const REPO = path.resolve(__dirname, '../../..')
const read = (rel: string) => readFileSync(path.join(REPO, rel), 'utf8')

/** Strip fenced code blocks and comment lines — examples live in both. */
const prose = (src: string) =>
  src
    .replace(/```[\s\S]*?```/g, ' ')
    .split(String.fromCharCode(10))
    .filter((l) => !l.trimStart().startsWith('//'))
    .join(String.fromCharCode(10))

describe('no live banking particulars in documentation', () => {
  // Documents are shared far more freely than source files: with an
  // accountant, a bank, a prospective collections partner, a member who asked
  // how it works. A number in a document travels.
  const DOCS = [
    '.env.example',
    'DEPLOYMENT.md',
    'docs/compliance/constitution.md',
    'docs/compliance/resolution-2026-09-banking.md',
    'docs/compliance/due-diligence-pack.md',
    'docs/compliance/registrations.md',
    'docs/stage-close-2026-09-05.md',
  ]

  /**
   * "account number 1234567890" / "branch code 123456" and the table and
   * key-value forms of the same. A South African account number is 9–11 digits
   * and a branch code is 6; anything in that range next to the words is the
   * thing this test exists to catch.
   */
  const NEAR_THE_WORDS =
    /(account\s*(?:number|no\.?)|branch\s*code)[^\n]{0,40}?\b\d{6,11}\b/i

  it.each(DOCS)('%s states no account or branch number', (doc) => {
    const found = prose(read(doc)).match(NEAR_THE_WORDS)

    expect(
      found?.[0] ?? null,
      `"${found?.[0]}" — put the value in Vercel or the Treasurer's register, ` +
        'not in a file this repository publishes',
    ).toBeNull()
  })

  it('the env template ships no value for the banking variables', () => {
    // The exact regression: a template that documents a variable by showing the
    // live value is not a template, it is a disclosure with an equals sign.
    const src = read('.env.example')

    for (const key of [
      'NEXT_PUBLIC_GROUP_BANK_ACCOUNT',
      'NEXT_PUBLIC_GROUP_BANK_BRANCH',
      'NEXT_PUBLIC_GROUP_BANK_NAME',
    ]) {
      const line = src.split(String.fromCharCode(10)).find((l) => l.startsWith(`${key}=`))
      expect(line, `${key} is missing from .env.example`).toBeDefined()
      expect(line, `${key} carries a value`).toBe(`${key}=`)
    }
  })

  it('says why, so the next person does not undo it', () => {
    // A bare redaction invites someone to helpfully fill it back in.
    expect(read('DEPLOYMENT.md')).toMatch(/unauthorised debit order/i)
    expect(read('.env.example')).toMatch(/repository is public/i)
  })
})

describe('no personal phone numbers', () => {
  // A real mobile arrived as an "e.g." in a config reference and spread to a
  // test fixture and an audit document. Examples get copied.
  const FILES = [
    'docs/constitutions/infra.md',
    'apps/web/__tests__/admin.service.test.ts',
    'docs/production-readiness/02-platform-architecture-audit.md',
    'DEPLOYMENT.md',
    '.env.example',
  ]

  /** A South African mobile in the form this system stores. */
  const SA_MOBILE = /27[6-8]\d{8}/g

  /**
   * The placeholders in use, listed rather than pattern-matched.
   *
   * Detecting "is this number real?" by shape cannot be done — a real number
   * and an invented one are the same shape, which is the whole difficulty. And
   * the alternative, pinning the leaked value by hash, is no good either: an
   * eleven-digit number has few enough possibilities that a digest of it is
   * reversible in seconds, so the test would publish what it was hiding.
   *
   * So: an allowlist. Anything else fails, and adding a number here is a
   * deliberate act somebody has to justify in review.
   */
  const PLACEHOLDERS = new Set([
    '27000000000', // reserved-looking; routes nowhere
    '27821234567', // sequential, the documentation example
    '27821000001', // test fixture
    '27821000002',
  ])

  it.each(FILES)('%s carries no real mobile number', (file) => {
    const found = [...read(file).matchAll(SA_MOBILE)]
      .map((m) => m[0])
      .filter((n) => !PLACEHOLDERS.has(n))

    expect(
      found,
      `${found.join(', ')} — if these are invented, add them to PLACEHOLDERS; ` +
        'if not, they do not belong in a public repository',
    ).toEqual([])
  })
})

describe('no member data, ever', () => {
  it('the ID numbers in the fixtures are invented, not borrowed', () => {
    // Every ID used to stand for a person in these suites is synthetic: a first
    // of the month birth date and a deliberately unreal sequence. This asserts
    // the property that makes them safe rather than listing them, so a new
    // fixture is held to the same standard.
    //
    // `sa-id.test.ts` is deliberately excluded. It exists to prove that
    // malformed IDs are REJECTED, so it is full of impossible dates — day 32,
    // month 13, the 31st of February. Those are the test working, and a check
    // that demanded they look plausible would have the logic exactly backwards.
    const fixtures = [
      'apps/web/__tests__/invite.service.test.ts',
      'apps/web/__tests__/password-policy.test.ts',
      'packages/utils/__tests__/password-policy.test.ts',
    ]

    for (const file of fixtures) {
      const ids = [...read(file).matchAll(/(\d{13})/g)].map((m) => m[1]!)

      for (const id of ids) {
        // A real ID encodes a real birth date. Every fixture here uses the
        // first of a month, which is the tell that nobody was copied.
        expect(
          id.slice(4, 6),
          `${file}: ${id.slice(0, 6)}… has a birth day of ${id.slice(4, 6)}. ` +
            'Fixtures use the 1st, so this may belong to a real person',
        ).toBe('01')
      }
    }
  })
})
