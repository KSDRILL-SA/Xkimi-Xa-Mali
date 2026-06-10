import type { BadgeTier } from '@prisma/client'
import { Medal, Award, Trophy, Crown } from 'lucide-react'
import { BADGE_TIER_ORDER, BADGE_TIER_LABELS, BADGE_TIER_BADGE_CLASS } from '@xxm/types'

export const BADGE_TIER_CONFIG: Record<BadgeTier, {
  label: string
  icon: typeof Medal
  iconBg: string
  iconColor: string
  badgeClass: string
  barVariant: 'default' | 'gold' | 'success' | 'danger'
}> = {
  AMATEUR:     { label: BADGE_TIER_LABELS.AMATEUR,     icon: Medal,  iconBg: 'bg-xxm-gray-100', iconColor: 'text-xxm-gray-500',  badgeClass: BADGE_TIER_BADGE_CLASS.AMATEUR,     barVariant: 'default' },
  SEMI_PRO:    { label: BADGE_TIER_LABELS.SEMI_PRO,    icon: Award,  iconBg: 'bg-sky-50',       iconColor: 'text-sky-600',       badgeClass: BADGE_TIER_BADGE_CLASS.SEMI_PRO,    barVariant: 'default' },
  PRO:         { label: BADGE_TIER_LABELS.PRO,         icon: Trophy, iconBg: 'bg-xxm-gold/12',  iconColor: 'text-xxm-gold-dark', badgeClass: BADGE_TIER_BADGE_CLASS.PRO,         barVariant: 'gold' },
  WORLD_CLASS: { label: BADGE_TIER_LABELS.WORLD_CLASS, icon: Crown,  iconBg: 'bg-xxm-green/10', iconColor: 'text-xxm-green',     badgeClass: BADGE_TIER_BADGE_CLASS.WORLD_CLASS, barVariant: 'success' },
}

export { BADGE_TIER_ORDER }
