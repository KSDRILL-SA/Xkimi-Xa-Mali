'use client'

import { Button } from '@/components/ui/Button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="rounded-2xl bg-red-50 border border-red-200 p-4">
        <AlertTriangle size={36} className="text-red-500" aria-hidden />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="font-semibold text-gray-800">Admin error</p>
        <p className="text-sm text-gray-400">{error.message || 'Failed to load this admin page.'}</p>
      </div>
      <Button onClick={reset} variant="outline" size="sm">
        <RefreshCw size={14} aria-hidden />
        Try again
      </Button>
    </div>
  )
}
