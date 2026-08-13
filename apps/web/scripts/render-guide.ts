/**
 * Render the Founder Guide straight to a file.
 *
 * The sibling of `render-statement.ts`, and it exists for the same reason: a
 * document you can only see by signing in and downloading is a document nobody
 * adjusts. This writes the PDF directly, so the loop is edit, run, look.
 *
 *   npm run render:guide --workspace=@xxm/web
 *   npm run render:guide --workspace=@xxm/web -- "KS Maluleke"
 *
 * Unlike the statement it touches no database — the guide is generated entirely
 * from the constants that enforce its rules, which is the whole point of it.
 * Output goes to `.render/`, which is gitignored.
 */
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateFounderGuidePdf } from '../lib/pdf/founder-guide'

async function main() {
  const holder = process.argv[2] ?? 'The Members'
  const pdf = await generateFounderGuidePdf({ holder })

  const dir = resolve(process.cwd(), '.render')
  mkdirSync(dir, { recursive: true })
  const out = resolve(dir, 'Xkimm-Xa-Mali-Founder-Guide.pdf')
  writeFileSync(out, pdf)

  // eslint-disable-next-line no-console -- a CLI script reporting where it wrote
  console.log(`${out}  (${pdf.byteLength} bytes)`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
