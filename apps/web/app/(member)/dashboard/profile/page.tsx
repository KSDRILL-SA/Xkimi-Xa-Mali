import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import {
  getMemberProfile,
  listBankAccounts,
  getNotificationPreferences,
} from '@/services/member.service'
import { Card, CardBody } from '@/components/ui/Card'
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-xxm-green-900">Profile &amp; Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your personal details, banking, and preferences.</p>
      </div>

      <Card>
        <CardBody>
          <Tabs
            tabs={[
              {
                id: 'profile',
                label: 'Personal',
                content: (
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
                ),
              },
              {
                id: 'banking',
                label: 'Bank accounts',
                content: <BankAccountsSection initial={serialisedAccounts} />,
              },
              {
                id: 'notifications',
                label: 'Notifications',
                content: <NotificationPreferencesForm initial={prefs} />,
              },
              {
                id: 'security',
                label: 'Security',
                content: <ChangePasswordForm />,
              },
              {
                id: 'privacy',
                label: 'Data & Privacy',
                content: <DataPrivacySection userId={userId} />,
              },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  )
}
