'use client'

import { useScrollReveal } from '@/hooks/useScrollReveal'

const founders = [
  {
    initials: 'KM',
    name: 'Maluleke Kurhula Success',
    title: 'Founder & Chairman',
    bio: 'The visionary behind Xkimm Xa Mali. Kurhula identified the need for a disciplined, technology-powered approach to communal savings and brought the collective to life.',
    initBg: 'bg-xxm-green text-white',
    ringHover: 'hover:ring-xxm-green/30',
    delay: 'delay-100',
  },
  {
    initials: 'NM',
    name: 'Maluleke Ntwanano Glen',
    title: 'Co-Founder & Treasurer',
    bio: 'The financial custodian of the collective. Ntwanano oversees financial integrity, ensures every contribution is accounted for, and guards the pool with discipline.',
    initBg: 'bg-xxm-gold text-xxm-green-950',
    ringHover: 'hover:ring-xxm-gold/40',
    delay: 'delay-200',
  },
  {
    initials: 'RM',
    name: 'Malulele Risima Blessing',
    title: 'Co-Founder & Secretary',
    bio: 'The keeper of records and governance. Risima ensures operational excellence, maintains the standards of the collective, and holds every member accountable.',
    initBg: 'bg-xxm-canopy text-white',
    ringHover: 'hover:ring-xxm-canopy/30',
    delay: 'delay-300',
  },
  {
    initials: 'RN',
    name: 'Nkuna Rito Blessing',
    title: 'Co-Founder & Member Relations',
    bio: 'The heart of the brotherhood. Rito nurtures relationships within the collective, champions member welfare, and ensures Xkimm Xa Mali remains rooted in trust.',
    initBg: 'bg-xxm-green-900 text-xxm-gold',
    ringHover: 'hover:ring-xxm-green-900/30',
    delay: 'delay-400',
  },
]

export function FoundersSection() {
  const revealRef = useScrollReveal(0.08)

  return (
    <section
      ref={revealRef}
      id="founders"
      className="py-20 md:py-32 px-4 md:px-8 bg-xxm-champagne-100"
      aria-labelledby="founders-heading"
    >
      <div className="max-w-screen-xl mx-auto">

        {/* header */}
        <div className="text-center mb-16 reveal">
          <span className="inline-flex items-center gap-2 bg-xxm-gold/10 border border-xxm-gold/20 rounded-full px-4 py-1.5 text-xxm-gold-dark text-xs font-bold tracking-widest uppercase mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-xxm-gold" aria-hidden />
            The Brotherhood
          </span>
          <h2
            id="founders-heading"
            className="mt-1 text-4xl md:text-5xl font-black text-xxm-green-900 leading-tight"
          >
            Four brothers. One pact.
          </h2>
          <p className="mt-5 text-gray-500 text-base md:text-lg max-w-xl mx-auto leading-relaxed">
            Built from scratch with nothing but discipline, vision, and each
            other&rsquo;s word.
          </p>
        </div>

        {/* founder cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {founders.map(({ initials, name, title, bio, initBg, ringHover, delay }) => (
            <div
              key={name}
              className={`reveal reveal-scale ${delay} group relative rounded-2xl bg-white border border-xxm-gold/10 p-6 flex gap-5 ring-2 ring-transparent ${ringHover} hover:shadow-gold transition-all duration-400 overflow-hidden`}
            >
              {/* top-right radial accent */}
              <div
                className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-0 group-hover:opacity-8 transition-opacity pointer-events-none"
                style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)' }}
                aria-hidden
              />

              {/* avatar */}
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black shrink-0 shadow-xxm ${initBg}`}
                aria-hidden
              >
                {initials}
              </div>

              {/* text */}
              <div className="flex-1 min-w-0">
                <p className="font-black text-xxm-green-900 text-base leading-snug">{name}</p>
                <p className="text-xxm-gold-dark text-xs font-bold uppercase tracking-widest mt-0.5 mb-3">
                  {title}
                </p>
                <p className="text-sm text-gray-500 leading-relaxed">{bio}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ubuntu callout */}
        <div className="mt-14 reveal delay-500 text-center">
          <div className="inline-block glass-gold rounded-2xl px-8 py-6 max-w-lg">
            <p className="text-xxm-green-900 text-base italic font-semibold leading-relaxed">
              &ldquo;I am because we are — together we build what none of us
              could build alone.&rdquo;
            </p>
            <p className="text-xxm-gold-dark text-xs mt-3 font-bold tracking-widest uppercase not-italic">
              Ubuntu — The founding principle
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
