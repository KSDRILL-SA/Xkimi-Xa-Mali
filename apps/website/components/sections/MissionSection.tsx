'use client'

import { Quote } from 'lucide-react'
import { useScrollReveal } from '@/hooks/useScrollReveal'
import { FACTS } from '@/lib/facts'

const pillars = [
  {
    title: 'Contributing',
    body: 'Every member commits to a monthly contribution. No exceptions, no excuses — this is how wealth begins.',
    num: '01',
  },
  {
    title: 'Growing',
    body: `Pooled contributions compound over time. What no individual can build alone, ${FACTS.founderWord} brothers build together.`,
    num: '02',
  },
  {
    title: 'Securing',
    body: 'Every rand is tracked. Every payment is audited. Every mandate is verified. We protect the collective with the rigour of a bank.',
    num: '03',
  },
]

export function MissionSection() {
  const revealRef = useScrollReveal(0.08)

  return (
    <section
      ref={revealRef}
      id="mission"
      className="relative py-20 md:py-32 overflow-hidden bg-xxm-green"
      aria-labelledby="mission-heading"
    >
      {/* background orbs */}
      <div
        className="absolute top-0 right-0 w-[700px] h-[700px] rounded-full opacity-8 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 65%)' }}
        aria-hidden
      />
      <div
        className="absolute bottom-0 left-0 w-[500px] h-[500px] rounded-full opacity-5 pointer-events-none"
        style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 65%)' }}
        aria-hidden
      />

      <div className="relative max-w-screen-xl mx-auto px-4 md:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* left — story */}
          <div className="reveal-left">
            <span className="inline-flex items-center gap-2 bg-xxm-gold/15 border border-xxm-gold/20 rounded-full px-4 py-1.5 text-xxm-gold text-xs font-bold tracking-widest uppercase mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-xxm-gold" aria-hidden />
              Our Mission
            </span>
            <h2
              id="mission-heading"
              className="font-display text-4xl md:text-5xl font-black text-white leading-tight"
            >
              Wealth moves faster when it{' '}
              <span className="text-shimmer">moves together.</span>
            </h2>

            <div className="mt-8 space-y-5 text-white/60 text-[15px] leading-relaxed">
              <p>
                Xkimm Xa Mali Foundation was born from a conversation between {FACTS.founderWord} men who shared a
                common frustration: despite earning consistently, individual financial progress
                felt slow, scattered, and unaccountable.
              </p>
              <p>
                They recognised what generations of their people had always known — that wealth
                moves faster and further when it moves together. Rooted in the age-old African
                wisdom of <strong className="text-white font-semibold">ubuntu</strong>, the
                platform was conceived as something more than ordinary group savings: a
                structured, transparent, technology-powered engine for collective financial
                discipline.
              </p>
            </div>

            {/* pull quote card */}
            <div className="mt-10 glass-gold rounded-2xl p-6 relative overflow-hidden">
              <Quote size={20} className="text-xxm-gold/40 mb-3" aria-hidden />
              <p className="text-white text-base italic leading-relaxed font-medium">
                &ldquo;Blessed is the hand that giveth.&rdquo;
              </p>
              <p className="text-xxm-gold/60 text-xs mt-2 tracking-widest uppercase not-italic font-semibold">
                — Acts 20:35
              </p>
            </div>
          </div>

          {/* right — pillars */}
          <div className="flex flex-col gap-5 reveal-right delay-200">
            <span className="inline-flex items-center gap-2 bg-xxm-gold/15 border border-xxm-gold/20 rounded-full px-4 py-1.5 text-xxm-gold text-xs font-bold tracking-widest uppercase w-fit mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-xxm-gold" aria-hidden />
              Three pillars, one purpose
            </span>

            {pillars.map(({ num, title, body }) => (
              <div
                key={num}
                className="flex gap-5 p-5 rounded-2xl bg-white/5 border border-white/8 hover:bg-white/8 hover:border-xxm-gold/20 transition-all duration-300 group"
              >
                <span className="text-3xl font-black text-xxm-gold/20 group-hover:text-xxm-gold/40 transition-colors leading-none shrink-0 mt-0.5 select-none">
                  {num}
                </span>
                <div>
                  <h3 className="font-display font-black text-white text-lg mb-1.5">{title}</h3>
                  <p className="text-white/55 text-sm leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
