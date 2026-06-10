import type { BadgeTier } from '@prisma/client'

export const BADGE_TIER_ORDER: BadgeTier[] = ['AMATEUR', 'SEMI_PRO', 'PRO', 'WORLD_CLASS']

export const BADGE_TIER_LABELS: Record<BadgeTier, string> = {
  AMATEUR: 'Amateur',
  SEMI_PRO: 'Semi-Pro',
  PRO: 'Pro',
  WORLD_CLASS: 'World Class',
}

export const BADGE_TIER_BADGE_CLASS: Record<BadgeTier, string> = {
  AMATEUR: 'bg-xxm-gray-100 text-xxm-gray-600',
  SEMI_PRO: 'bg-sky-100 text-sky-700',
  PRO: 'bg-amber-100 text-amber-700',
  WORLD_CLASS: 'bg-xxm-green-100 text-xxm-green-700',
}
