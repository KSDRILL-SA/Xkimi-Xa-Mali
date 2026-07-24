import { Calendar, CalendarRange, Sparkles, Target, Trophy, type LucideIcon } from 'lucide-react'

export type GoalStatusKey = 'DRAFT' | 'ACTIVE' | 'ACHIEVED' | 'FAILED'

export type StatusTheme = {
  label: string
  /** text-* colour used as the ring/progress stroke via currentColor */
  ring: string
  badge: string
  dot: string
  barFrom: string
  barTo: string
  /** soft ambient glow behind the card on hover */
  glow: string
}

export const STATUS_THEME: Record<GoalStatusKey, StatusTheme> = {
  DRAFT: {
    label: 'Draft', ring: 'text-xxm-gray-400', badge: 'bg-xxm-gray-100 text-xxm-gray-600',
    dot: 'bg-xxm-gray-400', barFrom: 'from-xxm-gray-300', barTo: 'to-xxm-gray-400', glow: '',
  },
  ACTIVE: {
    label: 'Active', ring: 'text-xxm-gold', badge: 'bg-amber-100 text-amber-700',
    dot: 'bg-xxm-gold', barFrom: 'from-xxm-gold', barTo: 'to-xxm-gold-light', glow: 'group-hover:shadow-gold-sm',
  },
  ACHIEVED: {
    label: 'Achieved', ring: 'text-xxm-green', badge: 'bg-xxm-green-100 text-xxm-green-700',
    dot: 'bg-xxm-green', barFrom: 'from-xxm-green', barTo: 'to-xxm-canopy', glow: '',
  },
  FAILED: {
    label: 'Failed', ring: 'text-red-500', badge: 'bg-red-100 text-red-700',
    dot: 'bg-red-500', barFrom: 'from-red-400', barTo: 'to-red-500', glow: '',
  },
}

export type TypeTheme = {
  label: string
  icon: LucideIcon
  /** gradient wash behind the type icon — gives each goal a distinct identity */
  wash: string
  accent: string
  chip: string
  blurb: string
}

export const TYPE_THEME: Record<string, TypeTheme> = {
  MONTHLY: {
    label: 'Monthly goal', icon: Calendar, wash: 'from-sky-400/25 to-cyan-400/5',
    accent: 'text-sky-600', chip: 'bg-sky-50 text-sky-700', blurb: 'A short-term target for this month',
  },
  YEARLY: {
    label: 'Yearly goal', icon: CalendarRange, wash: 'from-violet-400/25 to-fuchsia-400/5',
    accent: 'text-violet-600', chip: 'bg-violet-50 text-violet-700', blurb: 'A long-haul target for the year',
  },
  CUSTOM: {
    label: 'Custom goal', icon: Sparkles, wash: 'from-xxm-gold/30 to-amber-300/5',
    accent: 'text-xxm-gold-dark', chip: 'bg-amber-50 text-amber-700', blurb: 'A goal the brotherhood set together',
  },
}

export function typeTheme(type: string): TypeTheme {
  return TYPE_THEME[type] ?? TYPE_THEME.CUSTOM!
}

export function statusTheme(status: string): StatusTheme {
  return STATUS_THEME[(status as GoalStatusKey)] ?? STATUS_THEME.DRAFT
}

/** Icon shown inside the ring/header: a trophy once achieved, else the type icon. */
export function goalIcon(status: string, type: string): LucideIcon {
  if (status === 'ACHIEVED') return Trophy
  return typeTheme(type).icon
}

export { Target }
