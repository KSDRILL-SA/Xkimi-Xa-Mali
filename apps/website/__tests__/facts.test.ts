import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

/**
 * Nothing the public site says about the Foundation may be typed if it can be
 * derived.
 *
 * That the derived values are *correct* is `packages/utils`' business and is
 * tested there, beside the constants they come from. What this file guards is
 * different and cannot be checked from there: that the next person to write a
 * sentence on this site reaches for `FACTS` instead of typing "four brothers"
 * again. A page can import the shared module and still hardcode the number two
 * lines below it, and no assertion about `FACTS` would ever notice.
 *
 * It earns its keep. The `Netcash DebiCheck` rule found occurrences in
 * `FeaturesSection` and `HowItWorksSection` that a careful manual sweep had
 * already missed twice.
 */
describe('no public source states a fact it could derive', () => {
  const ROOTS = ['app', 'components'].map((d) => path.resolve(__dirname, '..', d))

  function sourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
      else if (/\.tsx?$/.test(entry)) out.push(full)
    }
    return out
  }

  /** Comments are prose about the code, not copy the visitor reads. */
  function codeOnly(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
      .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
  }

  const BANNED: Array<[RegExp, string]> = [
    [/\bfour (brothers|men)\b/i, 'the founder count — use FACTS.founderWord'],
    [/R100\s*\+?\s*\/?\s*Month/i, 'the minimum contribution — use FACTS.minMonthlyPlus'],
    [/100%\s*Automated/i, 'a claim the audit log contradicts — removed, do not restore'],
    [/DebiCheck Verified/i, 'a credential the Foundation does not hold'],
    [
      /Netcash DebiCheck/i,
      'names a provider the Foundation has not yet applied to — say "DebiCheck Mandates"',
    ],
  ]

  it('types none of them', () => {
    const offenders: string[] = []

    for (const root of ROOTS) {
      for (const file of sourceFiles(root)) {
        const src = codeOnly(readFileSync(file, 'utf8'))
        for (const [pattern, why] of BANNED) {
          if (pattern.test(src)) {
            offenders.push(`${path.relative(path.resolve(__dirname, '..'), file)} — ${why}`)
          }
        }
      }
    }

    expect(offenders, `these state a fact rather than deriving it:\n  ${offenders.join('\n  ')}`)
      .toEqual([])
  })
})
