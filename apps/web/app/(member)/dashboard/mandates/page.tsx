import type { Metadata } from 'next'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { decrypt } from '@/lib/encryption'
import { MandateCard } from '@/components/mandate/MandateCard'
import { MandateForm } from '@/components/mandate/MandateForm'
import { Card } from '@/components/ui/Card'

export const metadata: Metadata = { title: 'Payment Mandates' }

export default async function MandatesPage() {
  const session = await auth()
  const userId = session!.user.id

  const [bankAccounts, mandates] = await Promise.all([
    db.bankAccount.findMany({
      where: { userId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, bankName: true, accountNumber: true, accountType: true, branchCode: true },
    }),
    db.paymentMandate.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        bankAccount: {
          select: { bankName: true, accountNumber: true, accountType: true, branchCode: true },
        },
      },
    }),
  ])

  // Mask encrypted account numbers before passing to client
  const maskedBankAccounts = bankAccounts.map((a) => ({
    id: a.id,
    bankName: a.bankName,
    accountNumberMasked: maskAccount(a.accountNumber),
    accountType: a.accountType,
  }))

  const maskedMandates = mandates.map((m) => ({
    ...m,
    amount: m.amount.toString(),
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
    bankAccount: {
      bankName: m.bankAccount.bankName,
      accountNumberMasked: maskAccount(m.bankAccount.accountNumber),
      accountType: m.bankAccount.accountType,
    },
  }))

  const hasActiveOrPending = mandates.some(
    (m) => m.status === 'ACTIVE' || m.status === 'PENDING',
  )

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-xxm-green-900">Payment mandates</h1>
        <p className="text-sm text-gray-500 mt-1">
          Your DebiCheck debit order mandate with Netcash. Only one active mandate at a time.
        </p>
      </div>

      {/* Create form — only shown if no active/pending mandate */}
      {!hasActiveOrPending && (
        <Card>
          <div className="p-5">
            <h2 className="text-base font-semibold text-xxm-green-900 mb-1">Set up a mandate</h2>
            <p className="text-sm text-gray-400 mb-5">
              Authorise a monthly debit from your bank account.
            </p>

            {bankAccounts.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-gray-500 mb-3">
                  You need to add a bank account before setting up a mandate.
                </p>
                <a
                  href="/dashboard/profile"
                  className="text-sm font-semibold text-xxm-green hover:underline"
                >
                  Go to Profile → Bank accounts
                </a>
              </div>
            ) : (
              <MandateForm bankAccounts={maskedBankAccounts} />
            )}
          </div>
        </Card>
      )}

      {/* Mandate list */}
      {maskedMandates.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {maskedMandates.length === 1 ? 'Your mandate' : 'Mandate history'}
          </h2>
          <div className="space-y-4">
            {maskedMandates.map((m) => (
              <MandateCard key={m.id} mandate={m} />
            ))}
          </div>
        </section>
      )}

      {/* Empty state */}
      {maskedMandates.length === 0 && bankAccounts.length > 0 && (
        <p className="text-sm text-gray-400 text-center py-4">
          No mandates yet. Complete the form above to get started.
        </p>
      )}
    </div>
  )
}

function maskAccount(encrypted: string): string {
  const plain = decrypt(encrypted)
  return plain.slice(-4).padStart(plain.length, '*')
}
