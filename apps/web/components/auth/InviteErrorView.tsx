import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'

const INVITE_ERRORS: Record<string, { message: string; cta: string; showLogin?: boolean }> = {
  INV_001: {
    message: 'This invite link is invalid.',
    cta: 'Contact the group admin for a new invite.',
  },
  INV_002: {
    message: 'This invite link has already been used.',
    cta: 'If you already have an account, sign in below.',
    showLogin: true,
  },
  INV_003: {
    message: 'This invite link has been revoked.',
    cta: 'Contact the group admin to get a new invite.',
  },
  INV_004: {
    message: 'This invite link has expired.',
    cta: 'Ask the admin to resend your invite.',
  },
}

export function InviteErrorView({ code }: { code: string }) {
  const err = INVITE_ERRORS[code] ?? {
    message: 'Something went wrong with this invite link.',
    cta: 'Contact the group admin for assistance.',
  }

  return (
    <div className="space-y-4 text-center">
      <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
        <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
      </div>
      <Alert variant="error">{err.message}</Alert>
      <p className="text-sm text-gray-500">{err.cta}</p>
      {err.showLogin && (
        <Button variant="ghost" size="sm" className="w-full" asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      )}
    </div>
  )
}
