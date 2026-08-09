/**
 * Render a member statement straight to a file.
 *
 * The design could only be seen by signing into the app, downloading through
 * the browser and converting by hand — minutes per look, which is the wrong
 * loop for adjusting a document. This writes the PDF directly, so the cycle is
 * edit, run, look.
 *
 *   npm run render:statement --workspace=@xxm/web
 *   npm run render:statement --workspace=@xxm/web -- 7 2026
 *
 * Renders whichever period is given, defaulting to the sample month that
 * `seed:statement` writes. Output goes to `.render/` which is gitignored — a
 * generated artefact of one sitting, never repository state.
 */
// First import, and DOTENV_CONFIG_PATH points it at .env.local — the env
// module validates at import time, so anything loaded before this throws.
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateMemberStatementPdf } from '../services/report.service'
import { db } from '../lib/db'

function lastMonth(): { month: number; year: number } {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return { month: d.getMonth() + 1, year: d.getFullYear() }
}

async function main() {
  const email = process.env.MEMBER_EMAIL
  if (!email) throw new Error('MEMBER_EMAIL is not set')

  const user = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) throw new Error(`No member found for ${email}`)

  const fallback = lastMonth()
  const month = Number(process.argv[2] ?? fallback.month)
  const year = Number(process.argv[3] ?? fallback.year)

  // The member's own id in both positions: this is the self-service path, and
  // `assertCanAccess` should be exercised rather than bypassed.
  const pdf = await generateMemberStatementPdf(user.id, user.id, [], month, year)

  const dir = resolve(process.cwd(), '.render')
  mkdirSync(dir, { recursive: true })
  const out = resolve(dir, `statement-${year}-${String(month).padStart(2, '0')}.pdf`)
  writeFileSync(out, pdf)

  // eslint-disable-next-line no-console -- a CLI script reporting where it wrote
  console.log(`${out}  (${pdf.byteLength} bytes)`)
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
