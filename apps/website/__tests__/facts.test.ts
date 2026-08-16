import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'
import {
  FOUNDER_COUNT,
  MAX_MEMBERS,
  MIN_CONTRIBUTION_ZAR,
  MAX_CONTRIBUTION_ZAR,
} from '@xxm/utils'

import { FACTS } from '@/lib/facts'

/**
 * Every fact the public site states about the Foundation, checked against the
 * constant the system actually enforces.
 *
 * The site used to type these: "R100+ / Month" in the hero, "four brothers" in
 * five pieces of copy, a member count of 4 in the stats fallback, and "100%
 * Automated Collections" in a grid of live figures. All but the last happened to
 * be correct, which is exactly the danger — the day somebody raises the minimum
 * contribution in `constants.ts`, the marketing site keeps quoting the old
 * figure to the public and nothing anywhere disagrees.
 *
 * The last one was not correct at all. It sat among measured numbers implying it
 * had been measured, while the audit log records manual payments and Netcash has
 * never run a live collection. It is now the member cap, which is a real fact
 * the system enforces by refusing the fiftieth seat.
 */

describe('the facts match the rules the system enforces', () => {
  it('states the founder count the constant fixes', () => {
    expect(FACTS.founderCount).toBe(FOUNDER_COUNT)
    expect(FACTS.founderWord).toBe('four')
    expect(FACTS.founderWordCapitalised).toBe('Four')
  })

  it('states the member cap the constant fixes', () => {
    expect(FACTS.memberCap).toBe(MAX_MEMBERS)
  })

  it('formats the contribution range in rand, South African style', () => {
    // A space, not a comma: a comma reads as a decimal point to a South
    // African, which on a page about money is not a small thing.
    //
    // The separator is a NON-BREAKING space, written here as an escape rather
    // than typed. An earlier version of this case typed a plain space and
    // failed with "expected 'R10 000' to be 'R10 000'" — two strings that are
    // identical on screen and different in memory. Spelling it out is the only
    // way this assertion stays readable.
    expect(FACTS.minMonthly).toBe(`R${MIN_CONTRIBUTION_ZAR}`)
    expect(FACTS.maxMonthly).toBe('R10\u00a0000')
    expect(FACTS.maxMonthly).not.toContain(',')
    expect(MAX_CONTRIBUTION_ZAR).toBe(10_000)
  })

  it('offers the hero its "+" form without inventing a ceiling', () => {
    expect(FACTS.minMonthlyPlus).toBe(`R${MIN_CONTRIBUTION_ZAR}+`)
  })
})

/**
 * A source scan, because the risk is not that these values are wrong today — it
 * is that the next person types one instead of importing it, and nothing
 * notices until the constant moves.
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
