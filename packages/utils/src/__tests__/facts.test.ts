import { describe, it, expect } from 'vitest'
import {
  FOUNDER_COUNT,
  MAX_MEMBERS,
  MIN_CONTRIBUTION_ZAR,
  MAX_CONTRIBUTION_ZAR,
} from '../constants'
import { FACTS } from '../facts'

/**
 * Every fact the apps state in prose, checked against the constant the system
 * actually enforces.
 *
 * These were typed out by hand in three apps: "four brothers" and "four men"
 * across the public site and the member app's about page and login screen,
 * "R100+ / Month" in a hero, and the founder guide's cover blurb. All of them
 * happened to be correct, which is exactly the danger — the day somebody raises
 * the minimum contribution in `constants.ts`, every one of those pages keeps
 * quoting the old figure and nothing anywhere disagrees.
 *
 * Asserted against the constants rather than against literals. A test that
 * hardcodes the number it is checking cannot catch that number drifting, which
 * is the entire failure this module was written to prevent.
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
    // The separator is a NON-BREAKING space, written as an escape rather than
    // typed. An earlier version of this case typed a plain space and failed
    // with "expected 'R10 000' to be 'R10 000'" — two strings identical on
    // screen and different in memory.
    expect(FACTS.minMonthly).toBe(`R${MIN_CONTRIBUTION_ZAR}`)
    expect(FACTS.maxMonthly).toBe('R10\u00a0000')
    expect(FACTS.maxMonthly).not.toContain(',')
    expect(MAX_CONTRIBUTION_ZAR).toBe(10_000)
  })

  it('groups only above a thousand, and never mid-number', () => {
    expect(FACTS.minMonthly).not.toContain('\u00a0')
  })

  it('offers a "+" form that states a floor without implying a ceiling', () => {
    expect(FACTS.minMonthlyPlus).toBe(`R${MIN_CONTRIBUTION_ZAR}+`)
  })
})

describe('what deliberately is not here', () => {
  it('exposes nothing that can only be known by asking the database', () => {
    // Member counts, pooled totals and months active change without a deploy.
    // If any of them were available as a constant, somebody would eventually
    // use the constant — which is precisely the bug that had the public site
    // publishing a member count of 4 during an outage. They belong to whatever
    // aggregates them, and there must be no shortcut.
    for (const forbidden of ['members', 'memberCount', 'totalPooled', 'monthsActive']) {
      expect(FACTS).not.toHaveProperty(forbidden)
    }
  })
})
