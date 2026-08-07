/**
 * The four brothers who founded the collective — one source of truth, shared by
 * the About page and the hero backdrop so the two can never drift.
 *
 * `photo` points at a finished portrait card: the name and title are part of the
 * artwork, and the images differ in aspect ratio (3:4 and 1:1) and in background tone
 * (dark studio and light grey). Anything rendering these must show them WHOLE —
 * cropping to fill a landscape frame cuts the name band off the bottom.
 */
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

export const FOUNDERS: readonly Founder[] = [
  {
    photo: '/founders/maluleke-kurhula-success.png',
    name: 'Maluleke Kurhula Success',
    title: 'Founder & Chairman',
    bio: 'The visionary behind Xkimm Xa Mali Foundation. Kurhula identified the need for a disciplined, technology-powered approach to communal savings and built the platform from the ground up.',
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
    bio: 'The heart of the brotherhood. Rito champions member welfare, nurtures relationships within the collective, and ensures Xkimm Xa Mali Foundation remains rooted in human trust.',
    ring: 'ring-xxm-green-900/20',
    accent: 'from-xxm-green-900/5',
  },
] as const
