import type { Metadata } from 'next'
import { getSession } from '@/lib/session'
import { getMessages } from '@/services/community.service'
import { getCommunityBadges } from '@/services/badge.service'
import { MessageBoard } from './MessageBoard'
import { MemberBadgeList } from './MemberBadgeList'
import { Reveal } from '@xxm/ui'
import { Users } from 'lucide-react'

export const metadata: Metadata = { title: 'Community' }

export default async function CommunityPage() {
  const session = await getSession()
  const userId = session!.user.id
  const roles = (session!.user.roles as string[] | undefined) ?? []

  const [messages, members] = await Promise.all([
    getMessages(1, 20, userId),
    getCommunityBadges(),
  ])

  return (
    <div className="space-y-6">

      {/* ── Header ────────────────────────────────────────── */}
      <Reveal variant="up" className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-xxm-green/10 flex items-center justify-center shrink-0">
          <Users size={22} className="text-xxm-green" aria-hidden />
        </div>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">Community</h1>
          <p className="text-sm text-xxm-gray-500 mt-1">
            Chat with fellow members and see everyone&apos;s reputation tier.
          </p>
        </div>
      </Reveal>

      <Reveal variant="up" delay={100} className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <MessageBoard
          initialItems={messages.items}
          initialTotalPages={messages.totalPages}
          initialDailyLimit={messages.dailyLimit}
          currentUserId={userId}
          isAdmin={roles.includes('ADMIN')}
        />
        <MemberBadgeList members={members} />
      </Reveal>
    </div>
  )
}
