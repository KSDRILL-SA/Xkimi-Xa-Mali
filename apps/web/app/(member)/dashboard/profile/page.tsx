import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import {
  getMemberProfile,
  listBankAccounts,
  getNotificationPreferences,
} from '@/services/member.service'
import { getMyBudgets, getOverrideHistory } from '@/services/budget.service'
import { Tabs } from '@/components/ui/Tabs'
import { ProfileForm } from '@/components/member/ProfileForm'
import { BankAccountsSection } from '@/components/member/BankAccountsSection'
import { NotificationPreferencesForm } from '@/components/member/NotificationPreferencesForm'
import { ChangePasswordForm } from '@/components/member/ChangePasswordForm'
import { LeaveFoundation } from '@/components/profile/LeaveFoundation'
import { DataPrivacySection } from '@/components/member/DataPrivacySection'
import { BudgetSettingsSection } from '@/components/member/BudgetSettingsSection'
import { Reveal } from '@xxm/ui'

export const metadata: Metadata = { title: 'Profile' }

interface AddressShape {
  line1?: string
  line2?: string
  city?: string
  province?: string
  postalCode?: string
}

export default async function ProfilePage() {
  const session = await getSession()
  if (!session?.user?.id) redirect('/login')

  const userId = session.user.id

  const [profile, bankAccounts, prefs, budgets, budgetOverrides] = await Promise.all([
    getMemberProfile(userId, userId, session.user.roles),
    listBankAccounts(userId),
    getNotificationPreferences(userId),
    getMyBudgets(userId, userId, session.user.roles ?? []),
    getOverrideHistory(userId, userId, session.user.roles ?? []),
  ])

  const serialisedAccounts = bankAccounts.map((a) => ({
    ...a,
    verifiedAt: a.verifiedAt ? a.verifiedAt.toISOString() : null,
  }))

  const name = session.user.name ?? ''
  const initials =
    name
      .split(' ')
      .map((w: string) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'

  return (
    <div className="space-y-6">

      {/* ── Header ─────────────────────────────────── */}
      <Reveal variant="up" className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-xxm-green to-xxm-canopy flex items-center justify-center shrink-0 shadow-sm transition-transform duration-slow ease-bounce hover:scale-105 hover:shadow-gold-sm">
          <span className="text-xl font-black text-white" aria-hidden>{initials}</span>
        </div>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">
            {name || 'Profile'}
          </h1>
          <p className="text-xxm-gray-500 text-sm mt-0.5">Manage your personal details, banking, and preferences.</p>
        </div>
      </Reveal>

      {/* ── Tabbed settings card ───────────────────── */}
      <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden">
        <Tabs
          tabs={[
            {
              id: 'profile',
              label: 'Personal',
              content: (
                <div className="p-5 md:p-6">
                  <ProfileForm
                    userId={userId}
                    initial={{
                      firstName: profile.firstName,
                      lastName: profile.lastName,
                      phone: profile.phone,
                      email: profile.email,
                      idNumberMasked: profile.idNumberMasked,
                      address: (profile.address as AddressShape | null) ?? null,
                    }}
                  />
                </div>
              ),
            },
            {
              id: 'banking',
              label: 'Bank accounts',
              content: (
                <div className="p-5 md:p-6">
                  <BankAccountsSection initial={serialisedAccounts} />
                </div>
              ),
            },
            {
              id: 'notifications',
              label: 'Notifications',
              content: (
                <div className="p-5 md:p-6">
                  <NotificationPreferencesForm initial={prefs} />
                </div>
              ),
            },
            {
              id: 'budget',
              label: 'Budget',
              content: (
                <div className="p-5 md:p-6">
                  <BudgetSettingsSection initial={budgets} initialOverrides={budgetOverrides} />
                </div>
              ),
            },
            {
              id: 'security',
              label: 'Security',
              content: (
                <div className="p-5 md:p-6">
                  <ChangePasswordForm />
                </div>
              ),
            },
            {
              id: 'privacy',
              label: 'Data & Privacy',
              content: (
                <div className="p-5 md:p-6 space-y-6">
                  <DataPrivacySection userId={userId} />
                  {/* Under Your Rights: "Leave the Foundation at any time, with
                      your history intact." Sits beside the other data rights
                      because that is what it is — a right, not a setting. */}
                  <LeaveFoundation />
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}
