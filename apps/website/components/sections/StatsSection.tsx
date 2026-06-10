import { StatsDisplay } from './StatsDisplay'
import { getPublicStats } from '@/lib/stats'

export async function StatsSection() {
  const data = await getPublicStats()
  return <StatsDisplay data={data} />
}
