/** Accepts plain numbers, strings, or Prisma Decimal-like values. */
export function formatZAR(amount: number | string | { toString(): string }): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(Number(amount))
}

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatMonth(month: number, year: number): string {
  return new Intl.DateTimeFormat('en-ZA', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1))
}

export function formatRelativeTime(date: Date | string): string {
  const d    = new Date(date)
  const diff = Date.now() - d.getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)  return 'Just now'
  if (mins  < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days  < 7)  return `${days}d ago`
  return formatDate(d)
}

export function formatInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'
}


/**
 * A South African mobile number, written the way people here write it.
 *
 * The same member's number is stored in whatever shape it arrived in — one
 * account carries `27820000000`, another `0683873999` — and the members list
 * printed each raw. Two members side by side looked like two different kinds of
 * data, and an admin reading down the column had to translate one of them.
 *
 * Normalises the international forms to the local one and groups it, so every
 * row reads the same: `082 000 0000`.
 *
 * Anything that is not recognisably an SA mobile number is returned untouched.
 * A display helper should never invent digits, and a number that does not fit
 * the pattern is more useful shown as stored than quietly reshaped into
 * something that looks right and is not.
 */
export function formatSAPhone(input: string | null | undefined): string {
  if (!input) return ''

  const digits = input.replace(/[\s()-]/g, '')

  let local: string | null = null
  if (/^\+27\d{9}$/.test(digits)) local = `0${digits.slice(3)}`
  else if (/^27\d{9}$/.test(digits)) local = `0${digits.slice(2)}`
  else if (/^0\d{9}$/.test(digits)) local = digits

  if (!local) return input

  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`
}
