// ─── SMS encoding and cost ───────────────────────────────────────────────────
//
// An SMS is billed per segment, and how many characters fit in a segment depends
// entirely on the alphabet the message uses. GSM-7 fits 160; a single character
// outside it forces the whole message into UCS-2, where a segment holds 70.
//
// That cliff is invisible in a code review. An em dash reads as ordinary
// punctuation and costs more than half the capacity of every message it appears
// in. It has been introduced into this codebase three separate times, and found
// each time only by measuring. These helpers exist so it can be caught instead.

/** The GSM 03.38 basic alphabet. Anything outside it forces UCS-2. */
const GSM7_BASIC = new Set(
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà',
)

/** Characters that fit in GSM-7 but consume two septets rather than one. */
const GSM7_EXTENDED = new Set('^{}\\[~]|€')

const GSM7_SINGLE_MAX = 160
const GSM7_MULTI_MAX = 153   // seven bits go to the concatenation header
const UCS2_SINGLE_MAX = 70
const UCS2_MULTI_MAX = 67

/** Every character in `text` that would force the message out of GSM-7. */
export function nonGsm7Characters(text: string): string[] {
  return [...new Set(
    [...text].filter((c) => !GSM7_BASIC.has(c) && !GSM7_EXTENDED.has(c)),
  )]
}

/** Whether the whole message fits the GSM-7 alphabet. */
export function isGsm7(text: string): boolean {
  return nonGsm7Characters(text).length === 0
}

export interface SmsCost {
  encoding: 'GSM-7' | 'UCS-2'
  /** Septets under GSM-7, UTF-16 code units under UCS-2. */
  units: number
  segments: number
  /** The characters responsible for UCS-2, empty when the message is GSM-7. */
  offendingCharacters: string[]
}

/**
 * What a message will actually cost to send.
 *
 * Pass the FINAL text — after any {{placeholder}} has been substituted — since a
 * rendered value can carry a character the template never did.
 */
export function smsCost(text: string): SmsCost {
  const offendingCharacters = nonGsm7Characters(text)

  if (offendingCharacters.length > 0) {
    // UTF-16 code units, deliberately not code points: UCS-2 is billed by the
    // 16-bit unit, so an emoji outside the BMP is a surrogate pair and fills two
    // of the seventy a segment holds. Counting by code point would report half
    // the true cost of any message carrying one.
    const units = text.length
    const segments = units <= UCS2_SINGLE_MAX ? 1 : Math.ceil(units / UCS2_MULTI_MAX)
    return { encoding: 'UCS-2', units, segments, offendingCharacters }
  }

  const units = [...text].reduce((n, c) => n + (GSM7_EXTENDED.has(c) ? 2 : 1), 0)
  const segments = units <= GSM7_SINGLE_MAX ? 1 : Math.ceil(units / GSM7_MULTI_MAX)
  return { encoding: 'GSM-7', units, segments, offendingCharacters }
}

/** Segments a message will be billed as. */
export function smsSegments(text: string): number {
  return smsCost(text).segments
}
