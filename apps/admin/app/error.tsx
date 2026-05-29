'use client'

import { useEffect } from 'react'
import { Button } from '@xxm/ui'
import { AlertCircle } from 'lucide-react'

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <AlertCircle size={24} className="text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-xxm-green-900">Something went wrong</h2>
        <p className="text-sm text-xxm-gray-500">An unexpected error occurred. Try again or contact support.</p>
        <Button onClick={reset} variant="secondary">Try again</Button>
      </div>
    </div>
  )
}
