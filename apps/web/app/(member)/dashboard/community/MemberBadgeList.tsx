import type { BadgeTier } from '@prisma/client'
import { BADGE_TIER_CONFIG } from '@/lib/badge-tier'
import { FounderMark } from '@/components/FounderMark'

type Member = {
  userId: string
  firstName: string
  lastName: string
  currentBadge: BadgeTier
  /** Conferred, not earned. Shown beside the tier, never instead of it. */
  isFounder?: boolean
}

export function MemberBadgeList({ members }: { members: Member[] }) {
  return (
    <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm overflow-hidden h-fit">
      <div className="px-5 py-4 border-b border-xxm-gray-100 bg-xxm-green-50/30">
        <h2 className="font-display text-base font-bold text-xxm-green-900">Members</h2>
        <p className="text-[11px] text-xxm-gray-400 mt-0.5">{members.length} member{members.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="divide-y divide-xxm-gray-50 max-h-[480px] overflow-y-auto">
        {members.map((m) => {
          const cfg = BADGE_TIER_CONFIG[m.currentBadge]
          const Icon = cfg.icon
          return (
            <div key={m.userId} className="group flex items-center gap-3 px-5 py-3 hover:bg-xxm-green-50/20 transition-colors">
              <div className={`w-8 h-8 rounded-xl ${cfg.iconBg} flex items-center justify-center shrink-0 transition-transform duration-slow group-hover:scale-110`}>
                <Icon size={14} className={cfg.iconColor} aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-xxm-green-900 truncate">{m.firstName} {m.lastName}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {/* Beside the tier, never instead of it — a founder sitting at
                    Amateur shows both, and neither reads as a correction of the
                    other. */}
                {m.isFounder ? <FounderMark size="sm" /> : null}
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.badgeClass}`}>
                  {cfg.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
