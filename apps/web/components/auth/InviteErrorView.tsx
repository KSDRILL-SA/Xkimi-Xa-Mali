import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
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
  INV_007: {
    message: 'That ID number does not match your invitation.',
    cta: 'Check the digits. If they are right, ask your group admin to correct the invitation.',
  },
  // Deliberately says nothing about the code that was tried. Somebody working
  // through codes must not learn from this screen whether any of them was real.
  SYS_005: {
    message: 'Too many attempts from this connection.',
    cta: 'Please wait a minute and open your invite link again.',
  },
}

export function InviteErrorView({ code }: { code: string }) {
  const err = INVITE_ERRORS[code] ?? {
    message: 'Something went wrong with this invite link.',
    cta: 'Contact the group admin for assistance.',
  }

  return (
    <div className="space-y-4 text-center">
      <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto animate-scale-in">
        <AlertTriangle className="w-7 h-7 text-red-500" aria-hidden />
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
