'use client'

import { useEffect } from 'react'
import { Button } from '@xxm/ui'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { logger } from '@xxm/observability'

export default function AdminDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // This boundary showed the admin a message and reported the failure nowhere —
  // not to Sentry, not even to the console.
  useEffect(() => {
    logger.error('Admin dashboard error boundary', { err: error, digest: error.digest })
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="rounded-2xl bg-xxm-champagne-200 border border-red-200 p-4">
        <AlertTriangle size={36} className="text-red-500" aria-hidden />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="font-semibold text-xxm-gray-800">Something went wrong</p>
        <p className="text-sm text-xxm-gray-400">{error.message || 'Failed to load this page.'}</p>
      </div>
      <Button onClick={reset} variant="outline" size="sm">
        <RefreshCw size={14} aria-hidden />
        Try again
      </Button>
    </div>
  )
}
