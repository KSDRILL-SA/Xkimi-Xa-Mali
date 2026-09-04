'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatZAR, formatMonth } from '@/lib/formatters'
import { PaymentModal } from './PaymentModal'
import { Button } from '@/components/ui/Button'
import { CalendarClock, AlertTriangle } from 'lucide-react'
import type { ContributionData, MandateInfo } from './ContributionLedger'

/**
 * The one period a member is here to act on, lifted out of the ledger.
 *
 * Previously the only way to pay was to find the right row among twelve and
 * press a "Pay" button sitting inside it — the primary action on the page,
 * indistinguishable from eleven rows that needed nothing. The oldest open
 * period now gets its own band, above the history, stating what is owed and
 * when it was due.
 *
 * Oldest, not newest: arrears are what a stokvel chases, and paying the oldest
 * outstanding month first is what keeps a member's standing intact.
 */
export function NextPaymentCard({
  contribution,
  mandate,
  paymentsEnabled,
}: {
  contribution: ContributionData
  mandate: MandateInfo
  /**
   * Whether in-app payment exists at all right now. It does not: since the
   * DebiCheck rejection there is no gateway, so `mandate` is null for every
   * member. Without this the card would tell all of them to "set up a mandate"
   * — advice that cannot be followed and that hides the way that does work.
   */
  paymentsEnabled: boolean
}) {
  const [showPay, setShowPay] = useState(false)

  const due = Number(contribution.amountDue)
  const paid = Number(contribution.amountPaid)
  const outstanding = Math.max(0, due - paid)
  const isOverdue = contribution.status === 'OVERDUE'
  const dueDate = new Date(contribution.dueDate)

  const Icon = isOverdue ? AlertTriangle : CalendarClock

  return (
    <>
      <section
        aria-label="Next payment"
        className={`overflow-hidden rounded-3xl border bg-white shadow-xxm-sm ${
          isOverdue ? 'border-red-200' : 'border-xxm-green/10'
        }`}
      >
        <div
          className={`flex items-center gap-2 px-4 py-2.5 sm:px-5 ${
            isOverdue ? 'bg-red-50' : 'bg-xxm-green-50'
          }`}
        >
          <Icon
            size={13}
            className={isOverdue ? 'text-red-500' : 'text-xxm-green'}
            aria-hidden
          />
          <h2
            className={`text-[11px] font-bold uppercase tracking-widest ${
              isOverdue ? 'text-red-700' : 'text-xxm-green-700'
            }`}
          >
            {isOverdue ? 'Payment overdue' : 'Next payment due'}
          </h2>
        </div>

        {/* Stacks at 360px: an amount, a date and a button cannot share a row
            on a narrow phone without the button crushing the text. */}
        <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-5">
          <div className="min-w-0">
            <p className="stat-number break-words text-2xl font-extrabold leading-none text-xxm-green-900">
              {formatZAR(outstanding)}
            </p>
            <p className="mt-1.5 text-[13px] text-xxm-gray-500">
              <span className="font-semibold text-xxm-gray-700">
                {formatMonth(contribution.periodMonth, contribution.periodYear)}
              </span>
              {' · due '}
              {dueDate.toLocaleDateString('en-ZA', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
            {paid > 0 && (
              <p className="mt-1 text-[11px] text-xxm-gray-400">
                {formatZAR(paid)} of {formatZAR(due)} already paid
              </p>
            )}
          </div>

          {mandate ? (
            <Button
              size="lg"
              onClick={() => setShowPay(true)}
              className="w-full shrink-0 sm:w-auto"
            >
              Pay {formatZAR(outstanding)}
            </Button>
          ) : paymentsEnabled ? (
            <Button asChild size="lg" variant="secondary" className="w-full shrink-0 sm:w-auto">
              <Link href="/dashboard/mandates">Set up a mandate</Link>
            </Button>
          ) : (
            // No gateway, so no in-app payment for anyone. Point at the route
            // that explains the offline arrangement in full rather than
            // repeating it in a card this size.
            <Link
              href="/dashboard/contribute"
              className="shrink-0 text-xs font-semibold text-xxm-green underline decoration-xxm-green/30 underline-offset-2 transition-colors hover:text-xxm-canopy sm:max-w-[13rem] sm:text-right"
            >
              Pay by EFT or cash — see how
            </Link>
          )}
        </div>
      </section>

      {showPay && mandate && (
        <PaymentModal
          contribution={{
            id: contribution.id,
            periodMonth: contribution.periodMonth,
            periodYear: contribution.periodYear,
            amountDue: due,
            amountPaid: paid,
            status: contribution.status,
          }}
          mandateBankName={mandate.bankName}
          mandateAccountMasked={mandate.accountNumberMasked}
          onClose={() => setShowPay(false)}
        />
      )}
    </>
  )
}
