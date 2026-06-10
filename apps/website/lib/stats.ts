export type PublicStats = {
  members: number
  totalPooled: number
  monthsActive: number
}

export const FALLBACK_STATS: PublicStats = { members: 4, totalPooled: 0, monthsActive: 0 }

export async function getPublicStats(): Promise<PublicStats> {
  const webUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  try {
    const res = await fetch(`${webUrl}/api/v1/stats/public`, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(2000),
    })
    if (res.ok) {
      const json = await res.json()
      return json.data ?? FALLBACK_STATS
    }
  } catch {
    // Fallback to static values if web app is unavailable
  }

  return FALLBACK_STATS
}
