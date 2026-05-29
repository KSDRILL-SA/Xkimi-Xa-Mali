export function isValidSAPhone(phone: string): boolean {
  return /^(\+27|0)[6-8][0-9]{8}$/.test(phone.replace(/\s/g, ''))
}

export function isValidSAID(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false
  const digits = id.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 12; i++) {
    if (i % 2 === 0) {
      sum += digits[i]!
    } else {
      const d = digits[i]! * 2
      sum += d > 9 ? d - 9 : d
    }
  }
  return (10 - (sum % 10)) % 10 === digits[12]
}

export function normaliseSAPhone(phone: string): string | null {
  const stripped = phone.replace(/[\s\-()]/g, '')
  if (/^\+27[6-8][0-9]{8}$/.test(stripped)) return stripped
  if (/^0[6-8][0-9]{8}$/.test(stripped))    return `+27${stripped.slice(1)}`
  return null
}
