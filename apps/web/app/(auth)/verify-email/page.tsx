import type { Metadata } from 'next'
import Link from 'next/link'
import { Mail } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { AuthHeading } from '@/components/auth/AuthHeading'

export const metadata: Metadata = { title: 'Verify email' }

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>
}) {
  const { sent } = await searchParams

  return (
    <div className="text-center space-y-4">
      <div className="w-16 h-16 rounded-full bg-xxm-green-100 flex items-center justify-center mx-auto animate-scale-in">
        <Mail className="w-8 h-8 text-xxm-green" aria-hidden />
      </div>
      <AuthHeading title="Check your email" centered />
      {sent ? (
        <Alert variant="info">
          A verification link has been sent to your email address. Click it to activate your account.
          The link expires in 24 hours.
        </Alert>
      ) : (
        <Alert variant="info">
          Please check your inbox for a verification link. If you didn&apos;t receive it, contact the group admin.
        </Alert>
      )}
      <Button variant="ghost" size="sm" asChild>
        <Link href="/login">Back to login</Link>
      </Button>
    </div>
  )
}
