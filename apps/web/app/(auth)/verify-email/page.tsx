import type { Metadata } from 'next'
import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'

export const metadata: Metadata = { title: 'Verify email' }

export default function VerifyEmailPage() {
  return (
    <div className="text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-xxm-green-100 flex items-center justify-center mx-auto">
        <svg className="w-8 h-8 text-xxm-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold text-xxm-green-900">Check your email</h1>
      <Alert variant="info">
        A verification link has been sent to your email address. Click it to activate your account.
        The link expires in 24 hours.
      </Alert>
      <Button variant="ghost" size="sm" asChild>
        <Link href="/login">Back to login</Link>
      </Button>
    </div>
  )
}
