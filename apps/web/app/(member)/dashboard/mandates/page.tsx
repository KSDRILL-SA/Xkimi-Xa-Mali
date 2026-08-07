import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { getMandates } from '@/services/mandate.service'
import { listBankAccounts } from '@/services/member.service'
import { MandateCard } from '@/components/mandate/MandateCard'
import { MandateForm } from '@/components/mandate/MandateForm'
import { Reveal } from '@xxm/ui'
import { CreditCard, UserCircle } from 'lucide-react'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Payment Mandates' }

export default async function MandatesPage() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id
  const roles = (session.user.roles as string[] | undefined) ?? []

  const [bankAccounts, mandates] = await Promise.all([
    listBankAccounts(userId),
    getMandates(userId, userId, roles),
  ])

  const maskedBankAccounts = bankAccounts.map((a) => ({
    id: a.id,
    bankName: a.bankName,
    accountNumberMasked: a.accountNumberMasked,
    accountType: a.accountType,
  }))

  const maskedMandates = mandates.map((m) => ({
    ...m,
    amount: m.amount.toString(),
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    bankAccount: {
      bankName: m.bankAccount.bankName,
      accountNumberMasked: m.bankAccount.accountNumberMasked,
      accountType: m.bankAccount.accountType,
    },
  }))

  const hasActiveOrPending = mandates.some(
    (m) => m.status === 'ACTIVE' || m.status === 'PENDING',
  )

  return (
    <div className="space-y-6 max-w-2xl">

      {/* ── Header ─────────────────────────────────── */}
      <Reveal variant="up" className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-xxm-gold/20 to-xxm-gold/5 flex items-center justify-center shrink-0 ring-1 ring-xxm-gold/20">
          <CreditCard size={22} className="text-xxm-gold-dark" aria-hidden />
        </div>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">Payment Mandates</h1>
          <p className="text-sm text-xxm-gray-500 mt-1">
            Your DebiCheck debit order mandate with Netcash. Only one active mandate at a time.
          </p>
        </div>
      </Reveal>

      {/* ── Create form ────────────────────────────── */}
      {!hasActiveOrPending && (
        <Reveal variant="up" delay={100} className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden">
          <div className="px-5 py-4 border-b border-xxm-gray-100 bg-gradient-to-br from-xxm-green-50/60 to-transparent">
            <h2 className="text-base font-bold text-xxm-green-900">Set up a mandate</h2>
            <p className="text-sm text-xxm-gray-400 mt-0.5">
              Authorise a monthly debit from your bank account.
            </p>
          </div>
          <div className="p-5">
            {bankAccounts.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-2xl bg-xxm-gray-100 flex items-center justify-center mx-auto mb-4">
                  <UserCircle size={22} className="text-xxm-gray-400" aria-hidden />
                </div>
                <p className="text-sm font-semibold text-xxm-gray-600 mb-1">
                  No bank accounts linked
                </p>
                <p className="text-xs text-xxm-gray-400 mb-4 max-w-xs mx-auto">
                  You need to add a bank account before setting up a mandate.
                </p>
                <Link
                  href="/dashboard/profile"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-xxm-green text-white text-xs font-semibold hover:bg-xxm-canopy transition-colors"
                >
                  Go to Profile → Bank accounts
                </Link>
              </div>
            ) : (
              <MandateForm bankAccounts={maskedBankAccounts} />
            )}
          </div>
        </Reveal>
      )}

      {/* ── Mandate list ───────────────────────────── */}
      {maskedMandates.length > 0 && (
        <Reveal variant="up" delay={200}>
        <section className="space-y-3">
          <h2 className="text-xs font-bold text-xxm-gray-400 uppercase tracking-widest">
            {maskedMandates.length === 1 ? 'Your mandate' : 'Mandate history'}
          </h2>
          <div className="space-y-3">
            {maskedMandates.map((m) => (
              <MandateCard key={m.id} mandate={m} />
            ))}
          </div>
        </section>
        </Reveal>
      )}

      {/* ── Empty state ────────────────────────────── */}
      {maskedMandates.length === 0 && bankAccounts.length > 0 && (
        <p className="text-sm text-xxm-gray-400 text-center py-6">
          No mandates yet. Complete the form above to get started.
        </p>
      )}
    </div>
  )
}
