export function formatZAR(amount: number | string): string {
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
