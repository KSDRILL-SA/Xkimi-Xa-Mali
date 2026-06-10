import type { BadgeTier } from '@prisma/client'
import { BADGE_TIER_ORDER, BADGE_TIER_LABELS, BADGE_TIER_BADGE_CLASS } from '@xxm/types'

export const BADGE_TIERS: BadgeTier[] = BADGE_TIER_ORDER

export { BADGE_TIER_LABELS }

export const BADGE_TIER_CLASS: Record<BadgeTier, string> = BADGE_TIER_BADGE_CLASS
