import { describe, it, expect } from 'vitest'
import { isValidSAId, birthDateFromSAId, ageFromSAId, maskSAId } from '../sa-id'

/**
 * The ID is what ties a bank account to a person, and until now the member
 * typed their own — optionally — and nobody could correct it afterwards. The
 * admin who invites somebody knows who they are, so the number comes from them
 * and is checked before it is stored.
 */

/** A number that satisfies the checksum. Born 1 January 1990. */
const VALID = '9001015800088'

describe('the checksum', () => {
  it('accepts a well-formed number', () => {
    expect(isValidSAId(VALID)).toBe(true)
  })

  it('rejects a single mistyped digit', () => {
    // The mistake an admin actually makes, reading a number off a document.
    const wrong = `${VALID.slice(0, 5)}${(Number(VALID[5]) + 1) % 10}${VALID.slice(6)}`
    expect(isValidSAId(wrong)).toBe(false)
  })

  it('rejects the wrong length', () => {
    expect(isValidSAId(VALID.slice(0, 12))).toBe(false)
    expect(isValidSAId(`${VALID}0`)).toBe(false)
  })

  it('rejects anything that is not digits', () => {
    expect(isValidSAId('90010158000８5')).toBe(false)
    expect(isValidSAId('900101-5800085')).toBe(false)
    expect(isValidSAId('')).toBe(false)
  })
})

describe('the date of birth inside the number', () => {
  it('reads it from the first six digits', () => {
    const born = birthDateFromSAId(VALID, new Date('2026-08-10'))
    expect(born?.toISOString().slice(0, 10)).toBe('1990-01-01')
  })

  it('puts a two-digit year that would be in the future into the last century', () => {
    // Read in 2026, "27" is 1927 rather than somebody not yet born. Right for
    // every living member, and stays right until somebody turns 100.
    const born = birthDateFromSAId('2701015800080', new Date('2026-08-10'))
    expect(born?.getUTCFullYear()).toBe(1927)
  })

  it('reads a year that has already passed as this century', () => {
    const born = birthDateFromSAId('0501015800086', new Date('2026-08-10'))
    expect(born?.getUTCFullYear()).toBe(2005)
  })

  it('refuses a month or day that is not one', () => {
    expect(birthDateFromSAId('9013015800085')).toBeNull()
    expect(birthDateFromSAId('9001325800085')).toBeNull()
  })

  it('refuses a date that does not exist', () => {
    // 31 February. Without the check the Date would roll into March and the
    // system would report a birthday nobody has.
    expect(birthDateFromSAId('9002315800085')).toBeNull()
  })
})

describe('age', () => {
  it('counts whole years', () => {
    expect(ageFromSAId(VALID, new Date('2026-08-10'))).toBe(36)
  })

  it('does not count a birthday that has not happened yet this year', () => {
    expect(ageFromSAId('9012015800085', new Date('2026-08-10'))).toBe(35)
  })

  it('counts the birthday itself', () => {
    expect(ageFromSAId(VALID, new Date('2026-01-01'))).toBe(36)
  })
})

describe('showing it on a screen', () => {
  it('hides all but the last four', () => {
    // Enough for an admin to tell which number is on file, without putting the
    // whole thing where somebody could be standing behind them.
    expect(maskSAId(VALID)).toBe('•••••••••0088')
  })
})
