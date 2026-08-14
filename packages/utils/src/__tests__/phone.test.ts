import { describe, it, expect } from 'vitest'
import { formatSAPhone } from '../formatters'

/**
 * Phone numbers are stored in whatever shape they arrived in. One member's row
 * read `27820000000` while the next read `0683873999`, and the members list
 * printed both raw — so two members side by side looked like two different
 * kinds of record, and an admin scanning the column had to translate one.
 *
 * The rule this encodes is narrow on purpose: normalise the shapes that are
 * unambiguously the same South African mobile number, and leave everything else
 * exactly as stored. A display helper that reshapes a number it does not
 * recognise is worse than one that shows the truth plainly.
 */

describe('numbers that are the same number', () => {
  it('reads the international form as local', () => {
    expect(formatSAPhone('27820000000')).toBe('082 000 0000')
    expect(formatSAPhone('+27820000000')).toBe('082 000 0000')
  })

  it('leaves an already-local number local', () => {
    expect(formatSAPhone('0683873999')).toBe('068 387 3999')
  })

  it('gives every stored shape of one number the same output', () => {
    // The whole point: these are one person's phone, and the list should not
    // make them look like three different people's data.
    const forms = ['0820000000', '27820000000', '+27820000000', '+27 82 000 0000', '082-000-0000']
    const rendered = new Set(forms.map(formatSAPhone))
    expect(rendered).toEqual(new Set(['082 000 0000']))
  })
})

describe('what it refuses to touch', () => {
  it('returns an unrecognised number exactly as stored', () => {
    // Shown as it is, rather than reshaped into something that looks right.
    expect(formatSAPhone('12345')).toBe('12345')
    expect(formatSAPhone('+44 7700 900123')).toBe('+44 7700 900123')
    expect(formatSAPhone('not a phone')).toBe('not a phone')
  })

  it('does not accept a number of the wrong length', () => {
    // Nine digits after the zero is the rule; eight or ten is somebody else's
    // format and guessing at it would invent a digit.
    expect(formatSAPhone('082000000')).toBe('082000000')
    expect(formatSAPhone('08200000000')).toBe('08200000000')
  })

  it('handles nothing at all without throwing', () => {
    expect(formatSAPhone(null)).toBe('')
    expect(formatSAPhone(undefined)).toBe('')
    expect(formatSAPhone('')).toBe('')
  })
})
