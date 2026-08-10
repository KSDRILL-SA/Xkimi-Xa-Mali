/**
 * What a South African ID number tells you.
 *
 * The number is not opaque. Its first six digits are the holder's date of
 * birth, and the last is a checksum over the rest. So date of birth is not a
 * second thing to collect — it is already in the number, and collecting it
 * separately creates two sources of truth that can disagree. When they do, the
 * one that is wrong is always the one somebody typed.
 *
 *   9 0 0 1 0 1 5 8 0 0 0 8 1
 *   └───┬───┘ └┬┘         └┬┘
 *    YYMMDD  sequence   checksum
 */

/** Thirteen digits, nothing else. */
export const SA_ID_LENGTH = 13

/**
 * The Luhn checksum every SA ID carries in its last digit.
 *
 * Catches a mistyped digit and most transpositions, which is exactly the class
 * of mistake an admin makes reading a number off a document.
 */
export function isValidSAId(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false

  let sum = 0
  let double = false
  for (let i = SA_ID_LENGTH - 1; i >= 0; i--) {
    let digit = Number(id[i])
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  return sum % 10 === 0
}

/**
 * The date of birth carried in the first six digits, or null if they are not a
 * date.
 *
 * The century is not in the number, so it has to be inferred. A two-digit year
 * that would put somebody in the future belongs to the previous century: read
 * in 2026, "27" is 1927 rather than a person not yet born. That rule is right
 * for every living member and will stay right until someone is 100.
 */
export function birthDateFromSAId(id: string, now = new Date()): Date | null {
  if (!/^\d{13}$/.test(id)) return null

  const yy = Number(id.slice(0, 2))
  const mm = Number(id.slice(2, 4))
  const dd = Number(id.slice(4, 6))
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null

  const currentYY = now.getFullYear() % 100
  const century = yy > currentYY ? 1900 : 2000
  const year = century + yy

  const date = new Date(Date.UTC(year, mm - 1, dd))
  // Rejects 31 February and friends: the Date would have rolled into March.
  if (date.getUTCMonth() !== mm - 1 || date.getUTCDate() !== dd) return null

  return date
}

/** Whole years old, from the ID. Null when the number carries no usable date. */
export function ageFromSAId(id: string, now = new Date()): number | null {
  const born = birthDateFromSAId(id, now)
  if (!born) return null

  let age = now.getUTCFullYear() - born.getUTCFullYear()
  const monthDiff = now.getUTCMonth() - born.getUTCMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < born.getUTCDate())) age--
  return age
}

/**
 * All but the last four digits hidden.
 *
 * For showing an admin which ID is on file without putting the whole number on
 * a screen somebody might be standing behind.
 */
export function maskSAId(id: string): string {
  if (id.length < 4) return '•'.repeat(id.length)
  return `${'•'.repeat(id.length - 4)}${id.slice(-4)}`
}
