'use client'

import dynamic from 'next/dynamic'

// Client-only: loads after hydration so the module factory is never
// executed during the synchronous SSR/hydration pass.
const NavigationProgress = dynamic(
  () => import('./NavigationProgress').then((m) => m.NavigationProgress),
  { ssr: false },
)

export function NavigationProgressLoader() {
  return <NavigationProgress />
}
