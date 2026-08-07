'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { logger } from '@xxm/observability'

export default function MemberDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Previously this boundary did not even accept the error, so a failure
  // loading a member was shown to the admin and then discarded entirely.
  useEffect(() => {
    logger.error('Admin member detail error boundary', { err: error, digest: error.digest })
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
      <p className="text-xxm-green-900 font-semibold text-lg">Failed to load member</p>
      <p className="text-xxm-gray-500 text-sm max-w-sm">
        Something went wrong fetching this member&apos;s details. Please try again or go back to the list.
      </p>
      <div className="flex gap-3 mt-2">
        <button
          onClick={reset}
          className="px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-medium hover:bg-xxm-canopy transition-colors"
        >
          Try again
        </button>
        <Link href="/members" className="px-4 py-2 rounded-xl border border-xxm-gray-200 text-sm text-xxm-gray-600 hover:bg-xxm-gray-50 transition-colors">
          Back to members
        </Link>
      </div>
    </div>
  )
}
