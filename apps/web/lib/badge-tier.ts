import type { BadgeTier } from '@prisma/client'
import { Medal, Award, Trophy, Crown } from 'lucide-react'

export const BADGE_TIER_CONFIG: Record<BadgeTier, {
  label: string
  icon: typeof Medal
  iconBg: string
  iconColor: string
  badgeClass: string
  barVariant: 'default' | 'gold' | 'success' | 'danger'
}> = {
  AMATEUR:     { label: 'Amateur',     icon: Medal,  iconBg: 'bg-xxm-gray-100', iconColor: 'text-xxm-gray-500',  badgeClass: 'bg-xxm-gray-100 text-xxm-gray-600',   barVariant: 'default' },
  SEMI_PRO:    { label: 'Semi-Pro',    icon: Award,  iconBg: 'bg-sky-50',       iconColor: 'text-sky-600',       badgeClass: 'bg-sky-100 text-sky-700',             barVariant: 'default' },
  PRO:         { label: 'Pro',         icon: Trophy, iconBg: 'bg-xxm-gold/12',  iconColor: 'text-xxm-gold-dark', badgeClass: 'bg-amber-100 text-amber-700',         barVariant: 'gold' },
  WORLD_CLASS: { label: 'World Class', icon: Crown,  iconBg: 'bg-xxm-green/10', iconColor: 'text-xxm-green',     badgeClass: 'bg-xxm-green-100 text-xxm-green-700', barVariant: 'success' },
}

export const BADGE_TIER_ORDER: BadgeTier[] = ['AMATEUR', 'SEMI_PRO', 'PRO', 'WORLD_CLASS']
