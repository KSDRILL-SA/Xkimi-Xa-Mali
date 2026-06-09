'use client'

import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'

type Props = {
  error?: Error & { digest?: string }
  reset: () => void
  title?: string
  message?: string
}

export function ErrorCard({ error, reset, title = 'Something went wrong', message }: Props) {
  const body = message ?? error?.message ?? 'An unexpected error occurred. Please try again.'

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="rounded-2xl bg-red-50 border border-red-200 p-4">
        <AlertTriangle size={36} className="text-red-500" aria-hidden />
      </div>
      <div className="max-w-sm space-y-1">
        <p className="font-semibold text-xxm-gray-800">{title}</p>
        <p className="text-sm text-xxm-gray-400">{body}</p>
      </div>
      <Button onClick={reset} variant="outline" size="sm">
        <RefreshCw size={14} aria-hidden />
        Try again
      </Button>
    </div>
  )
}
