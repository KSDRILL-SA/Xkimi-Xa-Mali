'use client'

import { ErrorCard } from '@/components/ui/ErrorCard'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorCard error={error} reset={reset} message="Failed to load this page. Please try again." />
}
