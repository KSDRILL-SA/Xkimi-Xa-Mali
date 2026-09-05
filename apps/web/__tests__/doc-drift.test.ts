import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Numbers in prose that only a person can keep true.
//
// `DEPLOYMENT.md` told an operator to run `prisma migrate deploy` and said it
// "applies ALL 37 migrations". There were 49. Two architecture documents said
// 46, and the ERD had carried three different counts (34/17/16, then 39/21/46),
// each wrong within weeks of being written.
//
// None of that is a runtime defect, and it is not harmless either: an external
// auditor read the deployment docs, found the `DEPLOY_ENV` resolution order they
// described, and filed a P1 for a bug that had already been fixed. Stale
// documentation cost a whole finding and would have cost the next reader the
// same.
//
// The fix is not a better number. Replacing 37 with 49 reintroduces the same
// defect on a timer — the next migration makes it wrong again, silently, and
// nobody is watching. So the living documents point at the source instead, and
// this refuses to let a hand-maintained count back in.
//
// ── What is deliberately not covered ──────────────────────────────────────
//
// Dated records: the production-readiness audits, the completion guide, the
// compliance pack, session notes, `docs/archive`. Those describe a state at a
// time and were true when written; rewriting them would be falsifying a record
// rather than maintaining a document. Where one of them is actively misleading
// about current behaviour it carries a superseded banner instead — the same
// treatment `docs/session-handoff.md` already gets.
// ---------------------------------------------------------------------------

const REPO = path.resolve(__dirname, '../../..')

/** Documents that instruct rather than record. These have to be true today. */
const LIVING_DOCS = [
  'DEPLOYMENT.md',
  'docs/architecture/02-container-architecture.md',
  'docs/architecture/04-infrastructure-deployment.md',
  'docs/database/01-erd.md',
]

const read = (rel: string) => readFileSync(path.join(REPO, rel), 'utf8')

/** Document lines, however the file happens to be checked out. */
const lines = (src: string): string[] => src.split(String.fromCharCode(10)).map((l) => l.trim())

/** "46 migrations", "34 models", "17 enums" — a count somebody has to remember. */
const HAND_COUNTED = /\b\d+\s+(migrations|models|enums)\b/i

describe('living documents do not hand-count the schema', () => {
  it.each(LIVING_DOCS)('%s states no migration, model or enum count', (doc) => {
    const offending = read(doc).match(HAND_COUNTED)

    expect(offending?.[0] ?? null, 'point at the schema instead of counting it').toBeNull()
  })

  it('the real counts have already moved past what those docs claimed', () => {
    // Proof the concern is real rather than theoretical: the numbers that were
    // written down are not the numbers on disk.
    const migrations = readdirSync(path.join(REPO, 'packages/database/prisma/migrations'))
      .filter((entry) => /^\d/.test(entry))

    expect(migrations.length).toBeGreaterThan(46)
  })
})

describe('living documents describe the deployment we actually have', () => {
  it('DEPLOYMENT.md does not claim DEPLOY_ENV is read first', () => {
    // The order that produced the phantom payment, and the paragraph that
    // caused an external auditor to file a fixed bug as a P1.
    const src = read('DEPLOYMENT.md')

    expect(src).not.toMatch(/checks `?DEPLOY_ENV`? first/i)
    expect(src).toContain('`VERCEL_ENV === "production"`')
  })

  it('DEPLOYMENT.md does not tell an operator to set DEPLOY_ENV before going live', () => {
    // There is nothing to flip. An instruction to flip something implies the
    // checks are inert until you do, which is the state that caused the
    // incident.
    expect(read('DEPLOYMENT.md')).not.toMatch(/Set `DEPLOY_ENV=production` on/)
  })

  it('the architecture doc does not say production runs the mock gateway', () => {
    // Local and preview genuinely use the mock, and should say so. Production
    // selects `disabledGateway`: every money operation refuses rather than
    // being simulated, which is the distinction that matters — "mock in
    // production" is a description of the phantom-payment state.
    const src = read('docs/architecture/04-infrastructure-deployment.md')
    const production = lines(src)
      .filter((l) => /production/i.test(l))
      .join(' | ')

    expect(production).not.toMatch(/mock gateway/i)
    expect(src).toContain('disabledGateway')
  })

  it('no document still describes the Netcash application as pending', () => {
    // It was declined. "Under vetting" tells a reader to wait for something
    // that is not coming, and the whole shape of the system follows from the
    // refusal rather than from a delay.
    for (const doc of LIVING_DOCS) {
      expect(read(doc), doc).not.toMatch(/under vetting|registration is submitted/i)
    }
  })

  it('documents that describe the old order carry a superseded banner', () => {
    // Dated records are kept, not rewritten — but a reader has to be told
    // before they act on one.
    for (const doc of [
      'docs/production-readiness/01-financial-integration-test-plan.md',
      'docs/production-readiness/02-platform-architecture-audit.md',
    ]) {
      expect(read(doc), doc).toContain('Superseded on the `DEPLOY_ENV` question')
    }
  })
})
