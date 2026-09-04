import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// Two places personal information accumulates, and they are not the same case.
//
// **Application logs** leave the building. `logger.error` sends the entry to
// Sentry and `logger.warn` attaches one as a breadcrumb, so a field added for
// local debugging reaches a third-party processor and is retained on their
// schedule. The logger now redacts contact, identity, banking and credential
// fields (see @xxm/observability), which is the guarantee; the call sites are
// cleaned as well, because a redactor is a backstop and not an excuse.
//
// **Audit payloads** stay in our own database, and they are a legal artefact:
// POPIA's minimisation principle has to be weighed against the accountability
// requirement that the record identify who was affected. They are therefore
// NOT run through the redactor, and the rule applied here is narrower —
//
//     a payload records what changed;
//     who it was about is `entityId`, and who did it is `userId`.
//
// Every entry that carried an email already named its subject by `entityId`,
// with the address on the row that id points at. The copy added nothing an
// admin could not already reach, and an append-only table is the one place a
// redundant copy can never later be corrected or erased.
//
// The pattern to follow when a value genuinely matters is already in
// admin.service: correcting a member's ID number records
// `hadPreviousValue: member.idNumber !== null` — the fact of the change,
// not the number.
// ---------------------------------------------------------------------------

const read = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf8')

const SERVICES = [
  { name: 'invitations and roles (member app)', file: '../services/invite.service.ts' },
  { name: 'invitations and roles (console)', file: '../../admin/lib/services/invitations.ts' },
  { name: 'members (member app)', file: '../services/member.service.ts' },
  { name: 'members (console)', file: '../../admin/lib/services/members.ts' },
  { name: 'admin operations', file: '../services/admin.service.ts' },
] as const

/** A contact or identity value inside an audit payload. */
const PII_IN_PAYLOAD = /payload:\s*\{[^}]*\b(email|phone|idNumber|accountNumber)\s*[:,}]/

/** The same, inside a logger call's metadata object. */
const PII_IN_LOG = /logger\.\w+\([^)]*\{[^}]*\b(email|phone|idNumber|accountNumber)\s*[:,}]/

describe('audit payloads say what changed, not who it was about', () => {
  it.each(SERVICES)('$name carries no contact detail in a payload', ({ file }) => {
    const src = read(file)
    const offending = src.match(PII_IN_PAYLOAD)

    expect(offending?.[0] ?? null, 'entityId already names the subject').toBeNull()
  })

  it('the invite entries still record something worth having', () => {
    // Minimisation is not deletion. An audit row with an empty payload records
    // that something happened and nothing about it.
    const src = read('../services/invite.service.ts')

    expect(src).toContain("payload: { expiresAt }")
    expect(src).toMatch(/payload: \{ role: roleName, assigned: assign \}/)
  })

  it('an ID-number correction records the fact, not the number', () => {
    // The pattern the rest of this follows, and it was already here.
    expect(read('../services/admin.service.ts'))
      .toContain('hadPreviousValue: member.idNumber !== null')
  })
})

describe('application logs carry ids, not people', () => {
  it.each(SERVICES)('$name logs no contact detail', ({ file }) => {
    const src = read(file)
    const offending = src.match(PII_IN_LOG)

    expect(offending?.[0] ?? null, 'log an id; the row holds the rest').toBeNull()
  })

  it('the invite log still identifies the invitation and the admin', () => {
    // What the log was for: which invitation, and who issued it. Neither of
    // those needed the invitee's address.
    expect(read('../services/invite.service.ts'))
      .toContain("logger.info('Invite created', { inviteId: invite.id, adminId })")
  })
})

describe('the backstop is wired in', () => {
  it('the logger redacts before anything leaves the process', () => {
    // Call-site hygiene is not a guarantee: the next one is written by somebody
    // in a hurry, and `{ err }` on its own looks harmless while carrying a
    // provider's copy of the recipient.
    const logger = readFileSync(
      resolve(__dirname, '../../../packages/observability/src/logger.ts'),
      'utf8',
    )

    expect(logger).toContain("from './redact'")
    expect(logger).toContain('redact(serialised)')
  })
})
