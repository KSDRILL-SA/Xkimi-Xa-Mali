'use client'

import Link from 'next/link'

export default function AuthError({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4 text-center">
      <p className="font-semibold text-xxm-green-900">Something went wrong</p>
      <p className="text-sm text-xxm-gray-500">
        We ran into an unexpected error. Please try again or return to the login page.
      </p>
      <div className="flex flex-col gap-2">
        <button
          onClick={reset}
          className="w-full px-4 py-2.5 rounded-xl bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-canopy transition-colors"
        >
          Try again
        </button>
        <Link
          href="/login"
          className="w-full px-4 py-2.5 rounded-xl border border-xxm-gray-200 text-sm text-xxm-gray-600 hover:bg-xxm-gray-50 transition-colors text-center block"
        >
          Back to login
        </Link>
      </div>
    </div>
  )
}
