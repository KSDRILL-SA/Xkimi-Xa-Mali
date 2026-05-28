'use client'

import { useRef } from 'react'
import { useScrollReveal } from '@/hooks/useScrollReveal'

const stats = [
  { value: '4',    unit: '',   label: 'Active Members',       sub: 'Private brotherhood' },
  { value: '100',  unit: '%',  label: 'Automated Collections', sub: 'Via Netcash DebiCheck' },
  { value: 'R100', unit: '+',  label: 'Monthly Minimum',       sub: 'Per member contribution' },
  { value: '∞',   unit: '',   label: 'Full Audit Trail',       sub: 'Every rand tracked' },
]

export function StatsSection() {
  const ref = useScrollReveal(0.15) as React.MutableRefObject<HTMLElement>

  return (
    <section
      ref={ref as React.RefObject<HTMLDivElement>}
      id="stats"
      className="relative bg-xxm-green py-16 md:py-20 overflow-hidden"
      aria-label="Platform statistics"
    >
      {/* background pattern */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 50% 50%, #D4AF37 0%, transparent 60%)',
        }}
        aria-hidden
      />

      <div className="relative max-w-screen-xl mx-auto px-4 md:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {stats.map(({ value, unit, label, sub }, i) => (
            <div
              key={label}
              className={`reveal text-center delay-${i * 100 + 100}`}
            >
              <div className="mb-2">
                <span
                  className="stat-number text-4xl md:text-5xl font-black text-shimmer"
                >
                  {value}
                </span>
                {unit && (
                  <span className="text-2xl md:text-3xl font-black text-xxm-gold">{unit}</span>
                )}
              </div>
              <p className="text-white font-bold text-sm leading-tight">{label}</p>
              <p className="text-white/40 text-xs mt-1">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
