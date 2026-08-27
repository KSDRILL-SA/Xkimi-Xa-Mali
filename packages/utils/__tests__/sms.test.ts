import { describe, it, expect } from 'vitest'
import { isGsm7, smsCost, smsSegments, nonGsm7Characters } from '../src/sms'

describe('the character that keeps getting through', () => {
  // An em dash has been introduced into this codebase's SMS templates three
  // separate times. It reads as ordinary punctuation and costs more than half
  // the capacity of every message it appears in.
  it('an em dash forces UCS-2', () => {
    expect(isGsm7('IMPORTANT — R110 will be deducted')).toBe(false)
    expect(nonGsm7Characters('IMPORTANT — R110')).toEqual(['—'])
  })

  it('a hyphen does not', () => {
    expect(isGsm7('IMPORTANT - R110 will be deducted')).toBe(true)
  })

  it('names every offending character once, however often it appears', () => {
    expect(nonGsm7Characters('a — b — c “d”').sort()).toEqual(['—', '“', '”'].sort())
  })

  it('catches curly quotes and the ellipsis too', () => {
    expect(isGsm7('the “fund”')).toBe(false)
    expect(isGsm7('paid…')).toBe(false)
    expect(isGsm7('the "fund"...')).toBe(true)
  })

  it('accepts an emoji as what it is: a message twice the price', () => {
    expect(isGsm7('Goal achieved 🎉')).toBe(false)
  })
})

describe('the GSM-7 alphabet', () => {
  it('accepts the letters, digits and punctuation a message is made of', () => {
    expect(isGsm7("Xkimi Xa Mali Foundation: R110.00 is due on 25/08. Pay early! (ref #1) 50% @ 20:00")).toBe(true)
  })

  it('accepts the accented characters the standard includes', () => {
    expect(isGsm7('è é ù ì ò Ç Ø å Æ ß É Ä Ö Ñ Ü à ä ö ñ ü')).toBe(true)
  })

  it('accepts the currency symbols it covers', () => {
    expect(isGsm7('£ $ ¥ ¤ §')).toBe(true)
  })
})

describe('segment counting — GSM-7', () => {
  it('160 characters is one segment', () => {
    expect(smsCost('a'.repeat(160))).toMatchObject({ encoding: 'GSM-7', units: 160, segments: 1 })
  })

  it('161 tips into two, and the ceiling drops to 153 each', () => {
    // The concatenation header takes seven bits out of every segment, so a
    // message does not gain capacity by growing — it loses it.
    expect(smsSegments('a'.repeat(161))).toBe(2)
    expect(smsSegments('a'.repeat(306))).toBe(2)
    expect(smsSegments('a'.repeat(307))).toBe(3)
  })

  it('counts extended characters as the two septets they occupy', () => {
    expect(smsCost('€').units).toBe(2)
    expect(smsCost('[]{}').units).toBe(8)
  })

  it('an extended character can tip a message over on its own', () => {
    expect(smsSegments('a'.repeat(159))).toBe(1)
    expect(smsSegments('a'.repeat(159) + '€')).toBe(2)
  })
})

describe('segment counting — UCS-2', () => {
  it('70 characters is one segment, 71 is two', () => {
    expect(smsCost('—'.repeat(70))).toMatchObject({ encoding: 'UCS-2', segments: 1 })
    expect(smsSegments('—'.repeat(71))).toBe(2)
  })

  it('the ceiling drops to 67 once concatenated', () => {
    expect(smsSegments('—'.repeat(134))).toBe(2)
    expect(smsSegments('—'.repeat(135))).toBe(3)
  })

  it('one stray character drags the whole message down with it', () => {
    const plain = 'a'.repeat(150)
    expect(smsSegments(plain)).toBe(1)
    expect(smsSegments(plain + '—')).toBe(3)
  })
})

describe('what this measured on the real templates', () => {
  it('reproduces the urgent warning going from three segments to two', () => {
    // The exact fix made in #238: an em dash became a hyphen, and the message
    // got LONGER while costing less.
    const before = 'Xkimi Xa Mali Foundation: IMPORTANT — R110 will be deducted tonight at 20:00. A recent debit failed, so please make sure funds are available today to avoid another decline.'
    const after  = "Xkimi Xa Mali Foundation: IMPORTANT - R110 will be deducted tonight at 20:00. A recent debit failed, so please make sure funds are available today to avoid another decline. Humesa Mali N'wa Mfenhe!"

    expect(smsCost(before)).toMatchObject({ encoding: 'UCS-2', segments: 3 })
    expect(smsCost(after)).toMatchObject({ encoding: 'GSM-7', segments: 2 })
    expect(after.length).toBeGreaterThan(before.length)
  })
})

describe('edges', () => {
  it('an empty message is one segment, not zero', () => {
    expect(smsCost('')).toMatchObject({ units: 0, segments: 1, encoding: 'GSM-7' })
  })

  it('counts an astral character by its UTF-16 cost, which is what the wire carries', () => {
    // An emoji outside the BMP occupies two code units, so it fills two of the
    // seventy a UCS-2 segment holds.
    expect(smsCost('🎉').units).toBe(2)
  })

  it('reports no offending characters for a clean message', () => {
    expect(smsCost('all clear').offendingCharacters).toEqual([])
  })
})
