export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function todaySAST(): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-ZA', {
      timeZone: 'Africa/Johannesburg',
      year:  'numeric',
      month: '2-digit',
      day:   '2-digit',
    })
      .formatToParts(new Date())
      .map(({ type, value }) => [type, value]),
  )
  return `${parts['year']}-${parts['month']}-${parts['day']}`
}

export function currentPeriod(): { month: number; year: number } {
  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}
