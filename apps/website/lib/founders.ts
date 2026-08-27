/**
 * The four brothers who founded the collective — one source of truth, shared by
 * the About page and the hero backdrop so the two can never drift.
 *
 * `photo` points at a finished portrait card: the gold rule, the role in gold
 * caps and the name in white are printed INTO the artwork. Anything rendering
 * these must show them WHOLE — cropping to fill a frame slices the name band off
 * the foot — and must not print the name over them, which for a while the About
 * page did, so every card carried its name twice with a near-opaque gradient
 * dulling the printed one.
 *
 * All four are 3:4 (1086x1448) as at 2026-08-16. This note used to say they
 * differed, 3:4 and 1:1; they were evened up at some point and nobody updated
 * it. `object-contain` is still the right choice — it costs nothing while they
 * match and is the difference between a letterbox and a decapitation if one
 * ever does not.
 */
import { FOUNDER_COUNT } from '@xxm/utils'

export interface Founder {
  photo: string
  name: string
  title: string
  bio: string
  /** Tailwind ring colour used by the About page portrait grid. */
  ring: string
  /** Tailwind gradient start used by the About page hover wash. */
  accent: string
}

const ROSTER = [
  {
    photo: '/founders/maluleke-kurhula-success.png',
    name: 'Maluleke Kurhula Success',
    title: 'Founder & Chairman',
    bio: 'The visionary behind Xkimi Xa Mali Foundation. Kurhula identified the need for a disciplined, technology-powered approach to communal savings and built the platform from the ground up.',
    ring: 'ring-xxm-green/25',
    accent: 'from-xxm-green/5',
  },
  {
    photo: '/founders/maluleke-ntwanano-glen.png',
    name: 'Maluleke Ntwanano Glen',
    title: 'Co-Founder & Secretary',
    bio: 'The keeper of records and governance. Ntwanano ensures operational excellence, maintains the standards of the collective, and holds every member accountable to the pact.',
    ring: 'ring-xxm-gold/30',
    accent: 'from-xxm-gold/5',
  },
  {
    photo: '/founders/maluleke-risima-blessing.png',
    name: 'Maluleke Risima Blessing',
    title: 'Co-Founder & Treasurer',
    bio: 'The financial custodian of the collective. Risima oversees financial integrity, ensures every contribution is accounted for, and guards the pool with unwavering discipline.',
    ring: 'ring-xxm-canopy/25',
    accent: 'from-xxm-canopy/5',
  },
  {
    photo: '/founders/nkuna-rito-blessing.png',
    name: 'Nkuna Rito Blessing',
    title: 'Co-Founder & Welfare Officer',
    bio: 'The heart of the brotherhood. Rito champions member welfare, nurtures relationships within the collective, and ensures Xkimi Xa Mali Foundation remains rooted in human trust.',
    ring: 'ring-xxm-green-900/20',
    accent: 'from-xxm-green-900/5',
  },
] as const

/**
 * This roster and the Founder badge describe the same four people.
 *
 * They are deliberately independent otherwise: this file is public
 * presentation — photographs, titles, biographies — and the badge is a mark on
 * an account, granted by an admin. Neither should become the source of truth
 * for the other.
 *
 * What they do share is the number, so the number is checked. Add a fifth
 * founder here without changing `FOUNDER_COUNT` and the build stops, rather
 * than the About page and the badge cap quietly disagreeing about how many of
 * them there are.
 */
const rosterSizeMatchesFounderCount: typeof FOUNDER_COUNT = ROSTER.length
void rosterSizeMatchesFounderCount

export const FOUNDERS: readonly Founder[] = ROSTER
