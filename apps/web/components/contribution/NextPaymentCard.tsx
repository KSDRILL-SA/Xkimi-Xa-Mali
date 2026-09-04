'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatZAR, formatMonth } from '@/lib/formatters'
import { PaymentModal } from './PaymentModal'
import { Button } from '@/components/ui/Button'
import { CalendarClock, AlertTriangle, ArrowRight } from 'lucide-react'
import type { ContributionData, MandateInfo } from './ContributionLedger'

/**
 * The one period a member is here to act on, lifted out of the ledger.
 *
 * Previously the only way to pay was to find the right row among twelve and
 * press a small button inside it — the primary action on the page, styled
 * exactly like eleven rows that needed nothing.
 *
 * Oldest open period, not newest: arrears are what a stokvel chases, and
 * clearing the oldest outstanding month first is what protects a member's
 * standing.
 *
 * Styled to the dashboard's card language, with the accent carried by the
 * header strip rather than by elevation — an overdue month should be
 * unmistakable without shouting in shadow.
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
   * — advice that cannot be followed, and that hides the way that does work.
   */
  paymentsEnabled: boolean
}) {
  const [showPay, setShowPay] = useState(false)

  const due = Number(contribution.amountDue)
  const paid = Number(contribution.amountPaid)
  const outstanding = Math.max(0, due - paid)
  const progress = due > 0 ? Math.min(100, Math.round((paid / due) * 100)) : 0
  const isOverdue = contribution.status === 'OVERDUE'
  const dueDate = new Date(contribution.dueDate)

  const Icon = isOverdue ? AlertTriangle : CalendarClock

  return (
    <>
      <section
        aria-label="Next payment"
        className={`overflow-hidden rounded-2xl border bg-white shadow-xxm-sm ${
          isOverdue ? 'border-red-200' : 'border-xxm-green/12'
        }`}
      >
        <div
          className={`flex items-center gap-2 px-4 py-2.5 sm:px-5 ${
            isOverdue
              ? 'bg-gradient-to-r from-red-50 to-white'
              : 'bg-gradient-to-r from-xxm-green-50 to-white'
          }`}
        >
          <Icon size={13} className={isOverdue ? 'text-red-500' : 'text-xxm-green'} aria-hidden />
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
            <p className="stat-number break-words font-display text-3xl font-black leading-none tracking-tight text-xxm-green-900">
              {formatZAR(outstanding)}
            </p>
            <p className="mt-2 text-[13px] text-xxm-gray-500">
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
              <div className="mt-2.5 max-w-[16rem]">
                <span className="block h-1 w-full overflow-hidden rounded-full bg-xxm-gray-100">
                  <span
                    className="block h-full rounded-full bg-xxm-green transition-[width] duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </span>
                <p className="mt-1.5 text-[11px] text-xxm-gray-400">
                  {formatZAR(paid)} of {formatZAR(due)} already paid
                </p>
              </div>
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
              className="group inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-xxm-green/20 bg-white px-4 py-2.5 text-xs font-bold text-xxm-green transition-colors hover:bg-xxm-green-50"
            >
              Pay by EFT or cash
              <ArrowRight
                size={13}
                className="sm:transition-transform sm:group-hover:translate-x-0.5"
                aria-hidden
              />
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
