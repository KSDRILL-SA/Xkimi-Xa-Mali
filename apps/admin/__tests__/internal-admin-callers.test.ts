import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

/**
 * Every internal call must carry the admin who made it.
 *
 * `internalAdminPost` and `internalAdminRequest` reach the web app server to
 * server. There is no cookie on that hop, so the web app cannot read a session
 * and has no way to know who acted unless this app says so — which it does only
 * when passed `{ adminUserId }`.
 *
 * The broadcast page did not pass it. It called `requireAdmin` and threw away
 * the `userId` it got back, so every broadcast arrived anonymous. Combined with
 * the route's own fallback, that meant the acting admin was the literal string
 * `'system'`, which is not a user id — and the foreign key on
 * `inbox_messages.createdById` rejected it. No broadcast had ever succeeded.
 *
 * Six of the seven call sites were already correct, which is what makes this
 * worth a test rather than a comment: the convention existed and was simply not
 * followed once, in the one place nothing exercised.
 *
 * `adminIp` is checked with it. Without it the audit trail records this server
 * as the origin of the action rather than the person who clicked, and the trail
 * promises "where".
 */

const ROOTS = ['app', 'lib'].map((d) => path.resolve(__dirname, '..', d))

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const CALL = /internalAdmin(?:Post|Request)\s*(?:<[^>]*>)?\s*\(/g

/**
 * The whole argument list of a call, found by matching its parentheses.
 *
 * This used to take a fixed 700 characters from the call and search that. It
 * was a silent trap: `adminUserId` is the LAST argument, so a call whose body
 * grew past the window failed while being perfectly correct — the test
 * reporting a defect in code that has none, which costs more trust than no
 * test at all. `admin-action-ip.test.ts` already scans by parenthesis for
 * exactly this reason; this is that.
 */
function callArgs(src: string, openParen: number): string {
  let depth = 0
  for (let i = openParen; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')') {
      depth--
      if (depth === 0) return src.slice(openParen, i + 1)
    }
  }
  // Unbalanced means the file does not parse; let the real compiler say so.
  return src.slice(openParen)
}

type Site = { rel: string; line: number; window: string }

const SITES: Site[] = ROOTS.flatMap(sourceFiles)
  // The helper's own definition is not a call site.
  .filter((f) => !f.replace(/\\/g, '/').endsWith('lib/api.ts'))
  .flatMap((file) => {
    const src = readFileSync(file, 'utf8')
    const found: Site[] = []
    for (const m of src.matchAll(CALL)) {
      found.push({
        rel: path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/'),
        line: src.slice(0, m.index).split('\n').length,
        // The exact call, however long it is.
        window: callArgs(src, (m.index ?? 0) + m[0].length - 1),
      })
    }
    return found
  })

describe('server-to-server calls into the web app', () => {
  it('finds the call sites, so this suite is testing something', () => {
    expect(SITES.length).toBeGreaterThan(0)
  })

  for (const site of SITES) {
    it(`${site.rel}:${site.line} names the acting admin`, () => {
      expect(site.window).toContain('adminUserId')
    })
  }
})
