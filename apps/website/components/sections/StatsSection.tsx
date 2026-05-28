'use client'

import { useScrollReveal } from '@/hooks/useScrollReveal'

const stats = [
  { value: '4',    unit: '',  label: 'Active Members',        sub: 'Private brotherhood',     delay: 'delay-100' },
  { value: '100',  unit: '%', label: 'Automated Collections', sub: 'Via Netcash DebiCheck',   delay: 'delay-200' },
  { value: 'R100', unit: '+', label: 'Monthly Minimum',       sub: 'Per member contribution', delay: 'delay-300' },
  { value: '∞',   unit: '',  label: 'Full Audit Trail',       sub: 'Every rand tracked',      delay: 'delay-400' },
]

export function StatsSection() {
  const revealRef = useScrollReveal(0.15)

  return (
    <section
      ref={revealRef}
      id="stats"
      className="relative bg-xxm-green py-16 md:py-20 overflow-hidden"
      aria-label="Platform statistics"
    >
      {/* background radial */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #D4AF37 0%, transparent 60%)' }}
        aria-hidden
      />

      <div className="relative max-w-screen-xl mx-auto px-4 md:px-8">

        {/* section badge */}
        <div className="flex justify-center mb-10 reveal">
          <span className="inline-flex items-center gap-2 glass-gold rounded-full px-5 py-2 text-xxm-gold text-xs font-bold tracking-widest uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-xxm-gold" aria-hidden />
            By the numbers
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {stats.map(({ value, unit, label, sub, delay }) => (
            <div
              key={label}
              className={`reveal ${delay} flex flex-col items-center text-center gap-1 p-5 rounded-2xl bg-white/5 border border-white/8 hover:bg-white/10 hover:border-xxm-gold/20 transition-all duration-300`}
            >
              <div className="mb-1">
                <span className="stat-number text-4xl md:text-5xl font-black text-shimmer">
                  {value}
                </span>
                {unit && (
                  <span className="text-2xl md:text-3xl font-black text-xxm-gold">{unit}</span>
                )}
              </div>
              <p className="text-white font-bold text-sm leading-tight">{label}</p>
              <p className="text-white/40 text-xs">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
