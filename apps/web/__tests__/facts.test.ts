import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

/**
 * Nothing this app says about the Foundation may be typed if it can be derived.
 *
 * The public site got this guard first, and it was assumed the member app was
 * clean because the founder guide is generated from `constants.ts`. It was not.
 * The same "four brothers" sat in the login screen, five times across the about
 * page, and — of all places — in the cover blurb of the founder guide itself,
 * the one document whose whole point is that its numbers come from the
 * constants. Everything on that cover was derived except the sentence
 * describing what the Foundation is.
 *
 * That the derived values are correct is `packages/utils`' business and is
 * tested there. What this file guards is that the next person writing a
 * sentence reaches for `FACTS` rather than typing the number again — a file can
 * import the shared module and still hardcode the value two lines below, and no
 * assertion about `FACTS` would notice.
 */
describe('no member-facing source states a fact it could derive', () => {
  const APP = path.resolve(__dirname, '..')
  const ROOTS = ['app', 'components', 'lib/pdf'].map((d) => path.resolve(APP, d))

  function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
      else if (/\.tsx?$/.test(entry)) out.push(full)
    }
    return out
  }

  /**
   * Comments are prose about the code, not copy a member reads.
   *
   * This matters more here than on the public site: several modules explain in
   * their docblocks *why* the founder count is what it is, and those sentences
   * necessarily contain the words they are warning about.
   */
  function codeOnly(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
      .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
  }

  const BANNED: Array<[RegExp, string]> = [
    [/\bfour (brothers|men|founders)\b/i, 'the founder count — use FACTS.founderWord'],
    [/\bFour (brothers|men|founders)\b/, 'the founder count — use FACTS.founderWordCapitalised'],
    [/100%\s*Automated/i, 'a claim the audit log contradicts — collections are not yet automated'],
    [/DebiCheck Verified/i, 'a credential the Foundation does not hold'],
    [
      /Netcash DebiCheck/i,
      'names a provider the Foundation has not yet applied to — say "DebiCheck mandate"',
    ],
  ]

  it('types none of them', () => {
    const offenders: string[] = []

    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        const src = codeOnly(readFileSync(file, 'utf8'))
        for (const [pattern, why] of BANNED) {
          if (pattern.test(src)) {
            offenders.push(`${path.relative(APP, file)} — ${why}`)
          }
        }
      }
    }

    expect(offenders, `these state a fact rather than deriving it:\n  ${offenders.join('\n  ')}`)
      .toEqual([])
  })
})
