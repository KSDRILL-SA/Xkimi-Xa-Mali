'use client'

import { useScrollReveal } from '@/hooks/useScrollReveal'

type StatsData = {
  members: number
  totalPooled: number
  monthsActive: number
}

type Stat = {
  value: string
  unit: string
  label: string
  sub: string
  delay: string
}

/**
 * The pooled total, shortened without ever claiming more than there is.
 *
 * This used to be `(total / 1000).toFixed(0)` with a `+` always appended, which
 * rounds up: R1 500 was published as "R2k+" and R9 900 as "R10k+". On a savings
 * collective's public page that is not a formatting choice, it is a statement
 * about other people's money that is larger than the money.
 *
 * Floored, so the figure shown is always one the Foundation genuinely holds, and
 * the `+` appears only when something really was truncated — under a thousand
 * the exact rand figure is shown with no `+` at all, because R480 is R480 and
 * not "more than R480".
 */
function formatPooled(total: number): { value: string; unit: string } {
  if (total < 1000) return { value: `R${Math.floor(total)}`, unit: '' }
  return { value: `R${Math.floor(total / 1000)}k`, unit: '+' }
}

function buildStats(data: StatsData): Stat[] {
  const pooled = formatPooled(data.totalPooled)

  return [
    {
      // No `|| 4` here. A real zero is a fact about the Foundation, and the
      // fallback for an unreachable API already lives in `lib/stats`; a second
      // one here only turned a true zero into a number nobody could stand
      // behind. The same applied to months active, which published "1" while
      // the Foundation was still in its first month.
      value: String(data.members),
      unit:  '',
      label: 'Active Members',
      sub:   'Private brotherhood',
      delay: 'delay-100',
    },
    {
      value: pooled.value,
      unit:  pooled.unit,
      label: 'Total Pooled',
      sub:   'Contributions to date',
      delay: 'delay-200',
    },
    {
      value: String(data.monthsActive),
      unit:  '',
      label: 'Months Active',
      sub:   'Growing together',
      delay: 'delay-300',
    },
    {
      value: '100',
      unit:  '%',
      label: 'Automated Collections',
      sub:   'Via Netcash DebiCheck',
      delay: 'delay-400',
    },
  ]
}

export function StatsDisplay({ data }: { data: StatsData }) {
  const revealRef = useScrollReveal(0.15)
  const stats = buildStats(data)

  return (
    <section
      ref={revealRef}
      id="stats"
      className="relative bg-xxm-green py-16 md:py-20 overflow-hidden"
      aria-label="Platform statistics"
    >
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #D4AF37 0%, transparent 60%)' }}
        aria-hidden
      />

      <div className="relative max-w-screen-xl mx-auto px-4 md:px-8">
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
