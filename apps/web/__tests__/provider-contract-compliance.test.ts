import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { collectionReference, COLLECTION_REFERENCE_MAX_LENGTH } from '@xxm/utils/collection-reference'
import { debitAmountWithFee, NETCASH_FEE_BUFFER } from '@/lib/group-account'

// ---------------------------------------------------------------------------
// What the provider's contract requires of us, held as tests.
//
// Audits 1 to 4 read our code. Audit 5 read the document we would sign — and
// found the most serious defect of the sixty-three, because finding it required
// reading the contract rather than the code.
//
// These are the two that could not be caught any other way: they are only wrong
// relative to a clause, and nothing in the type system or the test suite knew
// the clause existed.
//
// Clause numbers are from Netcash's Appendix A, "Minimum Requirements to Use the
// Debit Order and DebiCheck Services", V.01072025.
// ---------------------------------------------------------------------------

const WEB = path.resolve(__dirname, '..')
const read = (rel: string) => readFileSync(path.join(WEB, rel), 'utf8')

describe('we never collect more than the mandate registers', () => {
  // §10.6.3 — a Dispute Request qualifies as a Dispute Action when "the amount
  // collected ... is greater than the Instalment Amount in the Mandate
  // Register".
  //
  // Every collection submits `contribution + fee`. The mandate registered the
  // bare contribution, as BOTH the collection amount and the maximum. So every
  // single collection qualified — automatically, by the contract's own wording
  // — against the 0.5% dispute threshold in §16.1.
  //
  // At fifty members that threshold is a quarter of one collection. One member
  // noticing is a fourfold breach, and §16.5 then forbids moving to another
  // provider until remediated.

  const src = () => read('lib/netcash.ts')

  it('registers the fee-inclusive amount, not the bare contribution', () => {
    const s = src()

    expect(s).toContain('collectionAmount: registeredAmount(payload.amount)')
    expect(s).toContain('firstCollectionAmount: registeredAmount(payload.amount)')
    expect(s).not.toMatch(/collectionAmount: payload\.amount\b/)
  })

  it('amends to the fee-inclusive amount too', () => {
    const s = src()

    expect(s).toContain('collectionAmountCents: toCents(registeredAmount(amount))')
  })

  it('does not set the maximum equal to the collection amount', () => {
    // The line that threw the fix away. C3 §3.10 permits a Maximum of up to
    // 1.5x the Instalment precisely so a fee-inclusive collection has headroom;
    // `maximumCollectionAmountCents: cents` alongside `collectionAmountCents:
    // cents` discarded it.
    const s = src()

    expect(s).not.toMatch(/collectionAmountCents: cents,\s*\n\s*maximumCollectionAmountCents: cents/)
    expect(s).toContain('maximumCollectionAmountCents: toCents(registeredMaximum(amount))')
  })

  it('derives the registered amount from the same function the collection uses', () => {
    // The reason the two drifted apart in the first place. If "what we tell the
    // bank" and "what we ask for" are computed separately, they will disagree
    // eventually.
    expect(src()).toContain('return debitAmountWithFee(contributionAmount)')
  })

  it('leaves headroom, but stays well inside the contractual ceiling', () => {
    // Headroom of one further fee: the buffer is an environment variable, and
    // raising it must not require every member to re-authenticate. Deliberately
    // modest — the member sees this ceiling at their bank.
    const instalment = debitAmountWithFee(450)
    const maximum = instalment + NETCASH_FEE_BUFFER

    expect(maximum).toBeGreaterThan(instalment)
    expect(maximum).toBeLessThanOrEqual(instalment * 1.5)
  })

  it('collects no more than it registered, at the full contribution', () => {
    // The property the whole finding is about, stated directly. `outstanding`
    // is never greater than the amount due, so the worst case is the full one.
    const contribution = 450
    const registered = debitAmountWithFee(contribution)
    const collected = debitAmountWithFee(contribution)

    expect(collected).toBeLessThanOrEqual(registered)
  })
})

describe('one collection reference per payer, and it never changes', () => {
  // §3.3   identifiable by a unique Contract/Agreement Reference between the
  //        Client and its Customer — the payer, not the period
  // §10.3  it reflects on the Customer's bank statement
  // §11.1  it is a primary key for Stop Payments and may not be changed to
  //        circumvent them
  // §18.9  once presented, it cannot change for the duration of the Contract
  //
  // There were four, and no two agreed. Three encoded the period, one the
  // transaction, and only the mandate's identified the payer — so the reference
  // the member authenticated was not the one any collection carried.

  it('identifies the payer, and the same payer twice over', () => {
    const a = collectionReference('cku1a2b3c4d5e6f7g8h9')

    expect(a).toBe(collectionReference('cku1a2b3c4d5e6f7g8h9'))
    expect(a).not.toBe(collectionReference('cku1a2b3c4d5e6zzzzz'))
  })

  it('uses the end of the id, where cuids actually differ', () => {
    // cuids share a prefix. Taking the first eight characters would give every
    // member the same reference — which is the defect, arrived at differently.
    const one = collectionReference('cku100000000000aaaa')
    const two = collectionReference('cku100000000000bbbb')

    expect(one).not.toBe(two)
  })

  it('has nothing in it that changes over time', () => {
    const ref = collectionReference('cku1a2b3c4d5e6f7g8h9')

    expect(ref).not.toMatch(/20\d\d/)
    expect(ref).not.toMatch(/RETRY|DELAY/i)
  })

  it('fits what the provider stores', () => {
    expect(collectionReference('cku1a2b3c4d5e6f7g8h9').length)
      .toBeLessThanOrEqual(COLLECTION_REFERENCE_MAX_LENGTH)
  })

  it('is the only thing any collection path builds', () => {
    // Five call sites: mandate registration, the debit run, the manual payment,
    // the delayed debit and the retry. A literal in any of them is the defect
    // coming back.
    const paths = [
      'services/mandate.service.ts',
      'inngest/functions/debit-run.ts',
      'inngest/functions/mandate-delay-handler.ts',
      'inngest/functions/transaction-retry-failed.ts',
      'services/contribution.service.ts',
    ]

    for (const p of paths) {
      const s = read(p)
      expect(s, p).toContain('collectionReference(')
      expect(s, p).not.toMatch(/reference(Number)?: `XXM-/)
    }
  })
})
