import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { Alert } from '@/components/ui/Alert'
import { Reveal } from '@xxm/ui'
import { HandCoins } from 'lucide-react'
import { MEMBER_PAYMENTS_ENABLED, PAYMENTS_DISABLED_MESSAGE } from '@/lib/payments-enabled'
import { ContributeForm } from './ContributeForm'

export const metadata: Metadata = { title: 'Make a Payment' }

/**
 * The gate in front of the payment form.
 *
 * The form is a client component and cannot ask whether a gateway exists —
 * which is why, when production was running the stand-in gateway, this page
 * cheerfully took a payment and reported it settled. The API route behind it
 * refuses now, but a form that submits and fails is a worse answer than a page
 * that says what is going on before anybody types an amount.
 *
 * Server-side, so the decision is made where the truth lives: the same
 * `MEMBER_PAYMENTS_ENABLED` the three payment routes use, derived from which
 * gateway adapter was actually selected rather than from a flag somebody has to
 * remember to change.
 */
export default async function ContributePage() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  if (!MEMBER_PAYMENTS_ENABLED) {
    return (
      <div className="space-y-6 max-w-2xl">
        <Reveal variant="up" className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-xxm-green/15 to-xxm-green/5 flex items-center justify-center shrink-0 ring-1 ring-xxm-green/10">
            <HandCoins size={22} className="text-xxm-green" aria-hidden />
          </div>
          <div>
            <h1 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">
              Make a Payment
            </h1>
            <p className="text-sm text-xxm-gray-500 mt-1">How to pay right now</p>
          </div>
        </Reveal>

        <Reveal variant="up" delay={100}>
          {/* Named as an arrangement rather than an outage. It is how the
              Foundation actually collects money today, and a page that only
              said "unavailable" would read as the app being broken. */}
          <Alert variant="info" title="Payments are made by EFT or cash">
            {PAYMENTS_DISABLED_MESSAGE}
          </Alert>
        </Reveal>

        <Reveal variant="up" delay={150} className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-5 space-y-3">
          <h2 className="text-sm font-bold text-xxm-green-900">What to do</h2>
          <ol className="space-y-2 text-sm text-xxm-gray-600 list-decimal pl-5">
            <li>Pay by EFT into the Foundation&apos;s account, or hand the cash to leadership.</li>
            <li>Send the proof of payment to the group.</li>
            <li>
              Leadership records it against the month or goal you paid for. It then appears on your
              statement with the proof attached, and you can open it yourself.
            </li>
          </ol>
          <p className="text-xs text-xxm-gray-400">
            Nothing is deducted from your account automatically while this is the case.
          </p>
        </Reveal>
      </div>
    )
  }

  return <ContributeForm />
}
