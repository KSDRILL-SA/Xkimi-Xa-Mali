import type { BadgeTier } from '@prisma/client'
import { BADGE_TIER_CONFIG } from '@/lib/badge-tier'

type Member = {
  userId: string
  firstName: string
  lastName: string
  currentBadge: BadgeTier
}

export function MemberBadgeList({ members }: { members: Member[] }) {
  return (
    <div className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm overflow-hidden h-fit">
      <div className="px-5 py-4 border-b border-xxm-gray-100 bg-xxm-green-50/30">
        <h2 className="text-base font-bold text-xxm-green-900">Members</h2>
        <p className="text-[11px] text-xxm-gray-400 mt-0.5">{members.length} member{members.length !== 1 ? 's' : ''}</p>
      </div>
      <div className="divide-y divide-xxm-gray-50 max-h-[480px] overflow-y-auto">
        {members.map((m) => {
          const cfg = BADGE_TIER_CONFIG[m.currentBadge]
          const Icon = cfg.icon
          return (
            <div key={m.userId} className="flex items-center gap-3 px-5 py-3">
              <div className={`w-8 h-8 rounded-xl ${cfg.iconBg} flex items-center justify-center shrink-0`}>
                <Icon size={14} className={cfg.iconColor} aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-xxm-green-900 truncate">{m.firstName} {m.lastName}</p>
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 ${cfg.badgeClass}`}>
                {cfg.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
