import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import {
  getMemberProfile,
  listBankAccounts,
  getNotificationPreferences,
} from '@/services/member.service'
import { Tabs } from '@/components/ui/Tabs'
import { ProfileForm } from '@/components/member/ProfileForm'
import { BankAccountsSection } from '@/components/member/BankAccountsSection'
import { NotificationPreferencesForm } from '@/components/member/NotificationPreferencesForm'
import { ChangePasswordForm } from '@/components/member/ChangePasswordForm'
import { DataPrivacySection } from '@/components/member/DataPrivacySection'

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

  const [profile, bankAccounts, prefs] = await Promise.all([
    getMemberProfile(userId, userId, session.user.roles),
    listBankAccounts(userId),
    getNotificationPreferences(userId),
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
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-xxm-green to-xxm-canopy flex items-center justify-center shrink-0 shadow-sm">
          <span className="text-xl font-black text-white" aria-hidden>{initials}</span>
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-xxm-green-900 tracking-tight">
            {name || 'Profile'}
          </h1>
          <p className="text-xxm-gray-500 text-sm mt-0.5">Manage your personal details, banking, and preferences.</p>
        </div>
      </div>

      {/* ── Tabbed settings card ───────────────────── */}
      <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm overflow-hidden">
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
                <div className="p-5 md:p-6">
                  <DataPrivacySection userId={userId} />
                </div>
              ),
            },
          ]}
        />
      </div>
    </div>
  )
}
