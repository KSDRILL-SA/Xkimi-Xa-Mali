'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/Button'

export default function AuthError({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4 text-center">
      <p className="font-semibold text-xxm-green-900">Something went wrong</p>
      <p className="text-sm text-xxm-gray-500">
        We ran into an unexpected error. Please try again or return to the login page.
      </p>
      <div className="flex flex-col gap-2">
        <Button onClick={reset} className="w-full" size="lg">
          Try again
        </Button>
        <Button variant="outline" asChild className="w-full" size="lg">
          <Link href="/login">Back to login</Link>
        </Button>
      </div>
    </div>
  )
}
