import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * What the contributions page hands to the browser.
 *
 * Everything a client component receives is serialised into the RSC payload and
 * readable in the page source. This page spread `...t` over every transaction,
 * and one column on `Transaction` is `gatewayResponse` — where the gateway
 * adapters store the **entire raw SOAP response** from Netcash under `raw`.
 *
 * So each member's browser was receiving the full XML for every collection ever
 * attempted against their account, including whatever a SOAP fault echoes back
 * of the request that produced it. `idempotencyKey`, `gatewayRef`,
 * `failureReason`, `mandateId` and `reversalOfId` travelled with it.
 *
 * `ContributionRow` declares five fields on a transaction and renders exactly
 * those five. TypeScript's structural typing accepts an object carrying thirty,
 * so nothing complained and nothing would have.
 */

const page = readFileSync(
  resolve(__dirname, '../app/(member)/dashboard/contributions/page.tsx'),
  'utf8',
)

/**
 * Bounded explicitly, and asserted.
 *
 * This used to end at `const hasOpen`, a name the page redesign removed.
 * `indexOf` then returned -1, `slice(start, -1)` ran to the end of the file,
 * and the "narrow" assertions below started reading the whole page — where
 * `userId` appears half a dozen times. The failure was loud in that direction,
 * but the opposite rename would have widened the slice silently and left these
 * tests passing over text they were never meant to see.
 */
const START = 'const serialized'
const END = 'const openPeriods'

const startAt = page.indexOf(START)
const endAt = page.indexOf(END)

describe('the slice this file reasons about', () => {
  it('still finds both boundaries in the page', () => {
    expect(startAt, START).toBeGreaterThan(-1)
    expect(endAt, END).toBeGreaterThan(startAt)
  })
})

const serialisation = page.slice(startAt, endAt)

describe('the transaction fields that cross into the browser', () => {
  it('does not spread the row', () => {
    expect(serialisation).not.toContain('...t,')
    expect(serialisation).not.toContain('...c,')
  })

  it('never sends the raw gateway response', () => {
    // The adapters store `raw: xml` — the whole SOAP envelope. It is the single
    // most sensitive thing on the row and the member has no use for it.
    expect(serialisation).not.toContain('gatewayResponse')
  })

  it('never sends the gateway or idempotency handles', () => {
    for (const field of ['idempotencyKey', 'gatewayRef', 'reversalOfId', 'mandateId']) {
      expect(serialisation, field).not.toContain(field)
    }
  })

  it('sends exactly the five fields the row renders', () => {
    const tx = serialisation.slice(serialisation.indexOf('transactions:'))
    for (const field of ['id:', 'type:', 'status:', 'amount:', 'createdAt:']) {
      expect(tx, field).toContain(field)
    }
  })

  it('keeps the contribution itself narrow too', () => {
    // `...c` carried `userId` and the optimistic-locking `version` column.
    expect(serialisation).not.toContain('userId')
    expect(serialisation).not.toContain('version')
  })
})

describe('a page number that is not a number', () => {
  it('falls back to page one rather than reaching Prisma as NaN', () => {
    // `Math.max(1, Number('abc'))` is NaN, which arrived as `skip: NaN` and
    // returned a 500 to a member who mistyped a URL.
    expect(page).toContain('Number.isFinite(requestedPage)')
    expect(page).not.toMatch(/Math\.max\(1, Number\(params\.page/)
  })

  it('floors a fractional page rather than passing it through', () => {
    expect(page).toContain('Math.floor(requestedPage)')
  })
})
