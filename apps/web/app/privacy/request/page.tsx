import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, UserCheck } from 'lucide-react'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { AppFooter } from '@/components/layout/AppFooter'
import { auth } from '@/lib/auth'
import { REQUEST_KINDS, DSR_RESPONSE_DAYS } from '@/services/data-request.service'
import { RequestForm } from './RequestForm'

export const metadata: Metadata = {
  title: 'Make a Data Request',
  description:
    'Ask to see, correct, or delete the personal information the Foundation holds about you, under the Protection of Personal Information Act.',
}

/**
 * The page behind the promise the Privacy Policy already made.
 *
 * That policy says requests to the Information Officer are "properly recorded
 * and answered within the time the Act requires". Until this page existed, the
 * recording depended on an administrator reading a support email and remembering
 * to write it down — so the thirty days ran from the transcription rather than
 * from the request, and a request nobody transcribed had no clock at all.
 *
 * Reachable without signing in, deliberately. See the route handler for why.
 */
export default async function DataRequestPage() {
  const session = await auth()
  const user = session?.user

  // Prefilled only as a convenience. The values are still submitted as form
  // fields and re-read server-side, and the link to the account is taken from
  // the session rather than from anything typed here.
  const signedInAs = user?.email ? { name: user.name ?? '', email: user.email } : null

  return (
    <div className="min-h-screen flex flex-col bg-xxm-cream">
      <header className="bg-white border-b border-xxm-green/8">
        <div className="max-w-screen-md mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/privacy" className="inline-flex items-center gap-2 text-sm font-semibold text-xxm-green-700 hover:text-xxm-green-900">
            <ArrowLeft size={16} aria-hidden />
            Privacy Policy
          </Link>
          <XmmLogo className="h-7 w-auto" />
        </div>
      </header>

      <main className="flex-1">
        <section className="relative overflow-hidden bg-xxm-green py-12 md:py-16 px-4">
          <div
            className="absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl opacity-20 pointer-events-none"
            style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)' }}
            aria-hidden
          />
          <div className="relative max-w-screen-md mx-auto text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-xxm-gold/15 mb-5">
              <UserCheck size={24} className="text-xxm-gold" aria-hidden />
            </div>
            <p className="text-xs font-bold text-xxm-gold tracking-widest uppercase mb-2">Your Rights</p>
            <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">Make a Data Request</h1>
            <p className="text-white/75 text-[15px] leading-relaxed mt-4 max-w-lg mx-auto">
              Under the Protection of Personal Information Act you may ask to see, correct, or
              delete the personal information the Foundation holds about you, object to how it is
              used, or withdraw your consent. Your request is recorded the moment you submit it,
              and must be answered within {DSR_RESPONSE_DAYS} days.
            </p>
            <p className="text-white/50 text-sm mt-4 max-w-lg mx-auto">
              You do not need an account. If you were invited and never joined, or have already
              left, you can still use this form.
            </p>
          </div>
        </section>

        <div className="py-12 md:py-16 px-4">
          <div className="max-w-screen-md mx-auto">
            <RequestForm
              kinds={REQUEST_KINDS.map((k) => ({ value: k.value, label: k.label, helper: k.helper }))}
              responseDays={DSR_RESPONSE_DAYS}
              signedInAs={signedInAs}
            />
            <p className="text-xs text-xxm-gray-400 text-center mt-6 max-w-md mx-auto leading-relaxed">
              Prefer to write to a person? The Information Officer can also be reached through the{' '}
              <Link href="/support" className="text-xxm-green-700 underline hover:text-xxm-green-900 font-semibold">
                Support page
              </Link>
              . A request made that way is recorded here too, dated from when you sent it.
            </p>
          </div>
        </div>
      </main>

      <AppFooter />
    </div>
  )
}
