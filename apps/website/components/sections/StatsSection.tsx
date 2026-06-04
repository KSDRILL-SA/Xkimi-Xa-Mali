import { StatsDisplay } from './StatsDisplay'

const FALLBACK = { members: 4, totalPooled: 0, monthsActive: 0 }

export async function StatsSection() {
  const webUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  let data = FALLBACK
  try {
    const res = await fetch(`${webUrl}/api/v1/stats/public`, {
      next: { revalidate: 3600 },
    })
    if (res.ok) {
      const json = await res.json()
      data = json.data ?? FALLBACK
    }
  } catch {
    // Fallback to static values if web app is unavailable
  }

  return <StatsDisplay data={data} />
}
