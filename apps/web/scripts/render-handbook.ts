/**
 * Render the Leadership Handbook straight to a file.
 *
 * The sibling of `render-guide.ts`. Same reason: a document you can only see by
 * signing in and downloading is a document nobody adjusts.
 *
 *   npm run render:handbook --workspace=@xxm/web
 */
import 'dotenv/config'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { generateLeadershipHandbookPdf } from '../lib/pdf/leadership-handbook'

async function main() {
  const pdf = await generateLeadershipHandbookPdf({ holder: process.argv[2] ?? 'The Leadership' })
  const dir = resolve(process.cwd(), '.render')
  mkdirSync(dir, { recursive: true })
  const out = resolve(dir, 'Xkimi-Xa-Mali-Leadership-Handbook.pdf')
  writeFileSync(out, pdf)
  // eslint-disable-next-line no-console -- a CLI script reporting where it wrote
  console.log(`${out}  (${pdf.byteLength} bytes)`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
