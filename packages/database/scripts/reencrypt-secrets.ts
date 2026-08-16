/**
 * Re-encrypt every stored secret under the active encryption key.
 *
 * This is the middle step of a rotation. The app can already *read* values
 * written under a retired key — that is what `ENCRYPTION_PREVIOUS_KEYS` buys —
 * but a retired key cannot be thrown away until nothing is left that needs it.
 * This script is what makes that a checkable statement rather than a hope: it
 * walks every encrypted column, rewrites each value under the active key, and
 * reports what it could not read.
 *
 * The full procedure is in `docs/runbook.md`, "Rotating the encryption key".
 *
 *   Preview (default, writes nothing):
 *     npm run secrets:reencrypt
 *   Rewrite:
 *     npm run secrets:reencrypt -- --apply
 *
 * Safe to interrupt and safe to run twice. Each row is read, rewritten and
 * committed on its own, and a row already under the active key is skipped
 * without being decrypted — so a second run costs a scan and changes nothing.
 *
 * Exits non-zero if any value could not be read, because that is the one result
 * that must stop a rotation: those rows are still tied to a key someone is
 * about to delete.
 */

import { PrismaClient } from '@prisma/client'
import {
  buildKeyring,
  decryptEnvelope,
  encryptWithKeyring,
  envelopeKeyId,
  isWrittenUnderActiveKey,
  type Keyring,
} from '@xxm/utils/keyring'

const BATCH_SIZE = 200

const db = new PrismaClient()

/**
 * One encrypted column.
 *
 * Adding a column to the schema means adding it here too — otherwise a
 * rotation reports success while leaving that column pinned to the old key.
 * The columns are `User.idNumber`, `BankAccount.accountNumber` and
 * `Invitation.idNumber`.
 *
 * That third one was missing until 2026-08-16, and its absence was the exact
 * failure this script exists to prevent. `invite.service` stores the invitee's
 * SA ID encrypted, so a rotation rewrote users and bank accounts, reported zero
 * unreadable, and left every invitation pinned to the old key. The runbook then
 * permits retiring a key once the report is clean — at which point those ID
 * numbers become permanently unreadable, and the only sign is a registration
 * that fails identity verification long afterwards.
 *
 * Found by a restore drill on 2026-08-15, which read every encrypted column back
 * through the key ring and hit one invitation and one bank account it could not
 * decrypt. If a column is encrypted anywhere in the codebase, it belongs in
 * TARGETS below; the header comment claiming otherwise is how it was missed.
 */
interface Target {
  /** Table name as a person would say it, for the report. */
  readonly label: string
  /** Page through rows in a stable order, returning `{ id, value }` pairs. */
  read(afterId: string | null): Promise<Array<{ id: string; value: string | null }>>
  /** Write one row's new ciphertext. */
  write(id: string, value: string): Promise<void>
}

const TARGETS: Target[] = [
  {
    label: 'users.idNumber',
    async read(afterId) {
      const rows = await db.user.findMany({
        where: { idNumber: { not: null }, ...(afterId ? { id: { gt: afterId } } : {}) },
        select: { id: true, idNumber: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      })
      return rows.map((row) => ({ id: row.id, value: row.idNumber }))
    },
    async write(id, value) {
      await db.user.update({ where: { id }, data: { idNumber: value } })
    },
  },
  {
    label: 'bank_accounts.accountNumber',
    async read(afterId) {
      const rows = await db.bankAccount.findMany({
        where: afterId ? { id: { gt: afterId } } : {},
        select: { id: true, accountNumber: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      })
      return rows.map((row) => ({ id: row.id, value: row.accountNumber }))
    },
    async write(id, value) {
      await db.bankAccount.update({ where: { id }, data: { accountNumber: value } })
    },
  },
  {
    label: 'invitations.idNumber',
    // Every invitation, not just PENDING ones. An expired or revoked invitation
    // still holds a real person's ID number until retention removes it, and a
    // value nobody can read is not a value nobody is responsible for.
    async read(afterId) {
      const rows = await db.invitation.findMany({
        where: afterId ? { id: { gt: afterId } } : {},
        select: { id: true, idNumber: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
      })
      return rows.map((row) => ({ id: row.id, value: row.idNumber }))
    },
    async write(id, value) {
      await db.invitation.update({ where: { id }, data: { idNumber: value } })
    },
  },
]

interface Tally {
  scanned: number
  rewritten: number
  alreadyCurrent: number
  unreadable: Array<{ id: string; keyId: string; reason: string }>
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply')
  const keyring = buildKeyringFromEnvironment()

  console.log(
    apply
      ? `Re-encrypting under key "${keyring.activeId}". Writing.`
      : `Preview under key "${keyring.activeId}". Nothing will be written — pass --apply to rewrite.`,
  )
  console.log(
    `Keys available for reading: ${[keyring.activeId, ...keyring.previousKeys.keys()].join(', ')}\n`,
  )

  let unreadableTotal = 0

  for (const target of TARGETS) {
    const tally = await processTarget(target, keyring, apply)
    unreadableTotal += tally.unreadable.length
    report(target.label, tally, apply)
  }

  if (unreadableTotal > 0) {
    console.error(
      `\n${unreadableTotal} value(s) could not be read. Do not remove any key from ` +
        'ENCRYPTION_PREVIOUS_KEYS. Either the key that wrote them is missing from the ' +
        'ring, or the value was never ciphertext (a fixture, or a mock that reached a ' +
        'real database). Resolve those rows first, then run this again.',
    )
    process.exitCode = 1
    return
  }

  console.log(
    apply
      ? '\nEvery stored secret is now under the active key. The previous key can be removed ' +
          'from ENCRYPTION_PREVIOUS_KEYS once this has been confirmed in each environment.'
      : '\nNothing was written. Re-run with --apply to perform the rewrite.',
  )
}

async function processTarget(target: Target, keyring: Keyring, apply: boolean): Promise<Tally> {
  const tally: Tally = { scanned: 0, rewritten: 0, alreadyCurrent: 0, unreadable: [] }
  let cursor: string | null = null

  for (;;) {
    const rows: Array<{ id: string; value: string | null }> = await target.read(cursor)
    if (rows.length === 0) break

    for (const row of rows) {
      cursor = row.id
      if (row.value === null || row.value === '') continue
      tally.scanned += 1

      if (isWrittenUnderActiveKey(keyring, row.value)) {
        tally.alreadyCurrent += 1
        continue
      }

      let plaintext: string
      try {
        plaintext = decryptEnvelope(keyring, row.value)
      } catch (err) {
        tally.unreadable.push({
          id: row.id,
          keyId: describeKeyId(row.value),
          // The message names key ids and lengths only, never the value itself.
          reason: err instanceof Error ? err.message : String(err),
        })
        continue
      }

      if (apply) {
        await target.write(row.id, encryptWithKeyring(keyring, plaintext))
      }
      tally.rewritten += 1
    }

    if (rows.length < BATCH_SIZE) break
  }

  return tally
}

/**
 * Which key a stored value claims, for the report. Unversioned values predate
 * the key id and can only be described as such.
 */
function describeKeyId(envelope: string): string {
  try {
    return envelopeKeyId(envelope) ?? 'unversioned'
  } catch {
    return 'unrecognisable'
  }
}

function report(label: string, tally: Tally, apply: boolean): void {
  const verb = apply ? 'rewritten' : 'to rewrite'
  console.log(
    `${label}: ${tally.scanned} scanned · ${tally.rewritten} ${verb} · ` +
      `${tally.alreadyCurrent} already current · ${tally.unreadable.length} unreadable`,
  )

  // Row ids only. Never the ciphertext and never the plaintext — this output
  // ends up in terminal scrollback and CI logs.
  for (const row of tally.unreadable) {
    console.error(`  unreadable  id=${row.id}  key=${row.keyId}  ${row.reason}`)
  }
}

function buildKeyringFromEnvironment(): Keyring {
  const key = process.env.ENCRYPTION_KEY
  if (!key) {
    throw new Error(
      'ENCRYPTION_KEY is not set. Run this from the repository root so ' +
        'apps/web/.env.local is loaded, or export the key first.',
    )
  }

  return buildKeyring({
    key,
    keyId: process.env.ENCRYPTION_KEY_ID || undefined,
    previousKeys: process.env.ENCRYPTION_PREVIOUS_KEYS || undefined,
  })
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
