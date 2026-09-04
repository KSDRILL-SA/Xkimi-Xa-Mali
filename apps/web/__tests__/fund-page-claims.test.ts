import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Everything the fund page asserts must be true of the database.
 *
 * ── The error this file exists to prevent ──────────────────────────────────
 *
 * The goals table first shipped with an "All goals" total row summing
 * `Goal.currentAmount` across every goal, directly beneath a fund balance built
 * from the pool ledger. Those are not the same measure:
 *
 *   - `syncPrimaryGoalProgress` sets the primary fund's `currentAmount` to
 *     **every monthly contribution in the fund's window** plus directed
 *     payments — so it already contains the money shown under "Monthly
 *     contributions"
 *   - `syncAdditionalGoalProgress` adds admin-recorded `GoalProgress`, which is
 *     never posted to the pool ledger at all
 *
 * Summed, that column could exceed the fund itself while appearing to be part
 * of it. On a page whose only job is being believed, that is the worst
 * available bug. The row is gone and this holds it gone.
 */

const PAGE = resolve(__dirname, '../app/(member)/dashboard/fund/page.tsx')
const GOALS = resolve(__dirname, '../components/fund/GoalBreakdown.tsx')
const LEDGER = resolve(__dirname, '../services/ledger.service.ts')

const page = readFileSync(PAGE, 'utf8')
/**
 * Comments stripped for the hard-coded-money check: the file's own notes cite
 * "R6 000" as the example of the bug being fixed, and that is prose, not
 * markup a member ever sees.
 */
const pageCode = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const goals = readFileSync(GOALS, 'utf8')
const ledger = readFileSync(LEDGER, 'utf8')

describe('the goals table does not pretend to add up', () => {
  it('has no totals row', () => {
    expect(goals).not.toContain('<tfoot>')
    expect(goals).not.toContain('totalRaised')
  })

  it('says the primary fund is fed by monthly contributions', () => {
    // Without this, its figure looks like goal money and silently double-counts
    // against the monthly column.
    expect(goals).toContain('Fed by every monthly contribution')
  })

  it('the page warns that the goals table is a different measure', () => {
    expect(page).toContain('not part of that sum')
  })
})

describe('the append-only claim', () => {
  it('is true: nothing updates or deletes a ledger entry', () => {
    // The page tells members "nothing in it is ever edited or deleted". That
    // sentence is only allowed to exist while this is the case.
    const sources = [
      LEDGER,
      resolve(__dirname, '../services/contribution.service.ts'),
      resolve(__dirname, '../services/goal-payment.service.ts'),
      resolve(__dirname, '../services/admin.service.ts'),
    ].filter(existsSync)

    for (const path of sources) {
      const source = readFileSync(path, 'utf8')
      for (const mutation of ['ledgerEntry.update', 'ledgerEntry.delete', 'ledgerEntry.upsert']) {
        expect(source, `${path} must not call ${mutation}`).not.toContain(mutation)
      }
    }
  })

  it('is claimed on the page', () => {
    expect(page).toContain('append-only')
  })
})

describe('every figure on the page comes from the database', () => {
  it('the page renders no hard-coded money', () => {
    // A literal like `R 1 500` in the markup would be a number nobody can
    // trace. All money on this page arrives through formatZAR from a service.
    expect(pageCode).not.toMatch(/R\s?\d[\d\s.,]*\d/)
  })

  it('reads both halves from the services rather than inventing a total', () => {
    expect(page).toContain('getFundOverview')
    expect(page).toContain('getMemberFundShare')
  })

  it('derives the fund split from the ledger, not from the source tables', () => {
    // Contribution.amountPaid and GoalPayment.amount each know only their own
    // kind of money. The ledger carries both and has a reconciler, so a figure
    // taken from it cannot silently disagree with what settled.
    const overview = ledger.slice(ledger.indexOf('export async function getFundOverview'))
    expect(overview).toContain('db.ledgerEntry.groupBy')
    expect(overview).not.toContain('db.contribution.aggregate')
  })
})

describe('the links go somewhere', () => {
  const ROUTES = resolve(__dirname, '../app/(member)/dashboard')

  it.each([...page.matchAll(/href="(\/dashboard[^"{]*)"/g)].map((m) => m[1]!))(
    '%s exists',
    (href) => {
      const segment = href.replace('/dashboard', '').replace(/^\//, '')
      const target = segment === '' ? ROUTES : resolve(ROUTES, segment)
      expect(existsSync(resolve(target, 'page.tsx')), `${href} has no page.tsx`).toBe(true)
    },
  )

  it('the goal link is built from a real goal id', () => {
    // Not a slug or a title — the id the service selected.
    expect(goals).toContain('/dashboard/goals/${goal.id}')
  })
})
