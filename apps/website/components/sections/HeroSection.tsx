import { ArrowRight, ChevronDown, MessageCircle, Shield, TrendingUp, Users } from 'lucide-react'
import { APP_URL, adminWhatsAppUrl } from '@/lib/utils'
import { getPublicStats } from '@/lib/stats'
import { FoundersBackdrop } from './FoundersBackdrop'
import { FACTS } from '@xxm/utils'

export async function HeroSection() {
  const stats = await getPublicStats()

  return (
    <section
      id="hero"
      className="relative min-h-screen flex flex-col overflow-hidden bg-xxm-green-950"
      aria-labelledby="hero-headline"
    >
      {/* ── Background: the four founders, rotating ───────────────── */}
      <FoundersBackdrop />

      {/* ── Ambient light + grain, above the portraits ────────────── */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* animated light orbs */}
        <div
          className="absolute top-1/4 right-1/4 w-[600px] h-[600px] rounded-full opacity-10 animate-orb-drift-1 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)' }}
          aria-hidden
        />
        <div
          className="absolute bottom-1/3 left-1/5 w-[400px] h-[400px] rounded-full opacity-8 animate-orb-drift-2 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #2C5F47 0%, transparent 70%)' }}
          aria-hidden
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-5 animate-orb-drift-3 pointer-events-none"
          style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 60%)' }}
          aria-hidden
        />

        {/* noise grain texture */}
        <div className="noise-overlay" aria-hidden />
      </div>

      {/* ── Main content ──────────────────────────────────────────── */}
      {/* The fixed header's own height grows with `env(safe-area-inset-top)`
          on notch/Dynamic-Island phones. A flat `pt-28` (112px) is enough for
          the header's base 72px, but not enough headroom once a ~59px notch
          is added on top — the headline would sit partly under the bar. */}
      {/* `justify-start` on mobile, not `justify-center`. On desktop the
          founder's portrait sits to the right (`object-right`) and this text
          block to the left — different halves of the screen, so vertical
          centering never brings them near each other. On mobile there is no
          side-by-side split: the portrait is the full-bleed background
          *behind* this same text, name-and-title band baked into the
          artwork's own foot. Centering a variable-height block over that
          risked the stat pills — the last thing in it — landing right on
          top of the photo's own caption depending on content length and
          screen height. Anchoring to the top instead keeps this block's
          footprint predictable and clear of that zone; the bottom padding
          below is the deliberate gap that keeps it that way. */}
      <div
        className="relative z-10 flex-1 flex flex-col justify-start md:justify-center px-4 md:px-8 max-w-screen-xl mx-auto w-full pb-24 md:pb-12"
        style={{ paddingTop: 'calc(var(--nav-height) + env(safe-area-inset-top) + 2.5rem)' }}
      >
        <div className="max-w-3xl">

          {/* badge */}
          <div
            className="inline-flex items-center gap-2 glass-gold rounded-full px-4 py-2 mb-8 animate-fade-in-down"
            style={{ animationDelay: '0.1s' }}
          >
            <span className="w-2 h-2 rounded-full bg-xxm-gold animate-pulse-ring shrink-0" />
            <span className="text-xxm-gold text-xs font-bold tracking-widest uppercase">
              Contributing · Growing · Securing
            </span>
          </div>

          {/* headline — word by word staggered */}
          <h1
            id="hero-headline"
            className="font-display text-5xl sm:text-6xl md:text-7xl font-black text-white leading-[1.05] tracking-tight mb-6"
          >
            <span className="block overflow-hidden">
              <span
                className="block animate-fade-in-up"
                style={{ animationDelay: '0.2s' }}
              >
                Brotherhood.
              </span>
            </span>
            <span className="block overflow-hidden">
              <span
                className="block animate-fade-in-up"
                style={{ animationDelay: '0.35s' }}
              >
                Discipline.
              </span>
            </span>
            <span className="block overflow-hidden">
              <span
                className="block text-shimmer animate-fade-in-up"
                style={{ animationDelay: '0.5s' }}
              >
                Shared Wealth.
              </span>
            </span>
          </h1>

          {/* subheadline */}
          <p
            className="text-white/65 text-lg md:text-xl leading-relaxed max-w-xl mb-10 animate-fade-in-up"
            style={{ animationDelay: '0.65s' }}
          >
            Xkimi Xa Mali Foundation is a private, invite-only collective financial platform built
            on the African principle that{' '}
            <em className="text-xxm-gold/90 not-italic font-semibold">
              money moves faster and further when it moves together.
            </em>
          </p>

          {/* CTA row */}
          <div
            className="flex flex-wrap gap-4 mb-16 animate-fade-in-up"
            style={{ animationDelay: '0.8s' }}
          >
            <a
              href={`${APP_URL}/login`}
              className="btn-primary inline-flex items-center gap-2.5 px-7 py-3.5 rounded-2xl bg-xxm-gold text-xxm-green-950 font-bold text-base shadow-gold"
            >
              Sign In
              <ArrowRight size={16} aria-hidden />
            </a>

            <a
              href={adminWhatsAppUrl('Hi, I would like to join the Xkimi Xa Mali Foundation group. Please add me.')}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary inline-flex items-center gap-2.5 px-7 py-3.5 rounded-2xl border border-white/20 text-white/80 font-semibold text-base hover:border-xxm-gold/40"
            >
              <MessageCircle size={16} aria-hidden />
              Join WhatsApp
            </a>
          </div>

          {/* floating stat pills */}
          <div
            className="flex flex-wrap gap-3 animate-fade-in-up"
            style={{ animationDelay: '1s' }}
          >
            {[
              // Omitted rather than guessed when the member app is unreachable.
              // A pill reading "4 Members" beside two true statements is a
              // claim about the size of the collective, and an outage is not a
              // licence to make one; the row simply carries two pills instead.
              ...(stats
                ? [{
                    icon: Users,
                    label: `${stats.members} Member${stats.members === 1 ? '' : 's'}`,
                    sub: 'Brotherhood',
                  }]
                : []),
              { icon: TrendingUp, label: `${FACTS.minMonthlyPlus} / Month`, sub: 'Per member' },
              // "DebiCheck Verified" claimed a credential the Foundation does
              // not hold — the Netcash merchant application has not been
              // submitted, so nothing has verified anything. The system is
              // built for DebiCheck and submits authenticated mandates, which
              // is what this now says. A financial credential is exactly the
              // claim a prospective member or a bank would rely on.
              { icon: Shield,     label: 'DebiCheck Mandates', sub: 'Bank-authenticated' },
            ].map(({ icon: Icon, label, sub }) => (
              <div
                key={label}
                className="glass flex items-center gap-3 px-4 py-3 rounded-2xl animate-float"
              >
                <div className="w-8 h-8 rounded-xl bg-xxm-gold/15 flex items-center justify-center shrink-0">
                  <Icon size={15} className="text-xxm-gold" aria-hidden />
                </div>
                <div>
                  <p className="text-white text-sm font-bold leading-none">{label}</p>
                  <p className="text-white/45 text-[11px] mt-0.5">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Scroll indicator ──────────────────────────────────────── */}
      <div className="relative z-10 pb-8 flex flex-col items-center gap-2 animate-fade-in" style={{ animationDelay: '1.4s' }}>
        <span className="text-white/30 text-[11px] tracking-widest uppercase font-medium">
          Discover More
        </span>
        <ChevronDown
          size={20}
          className="text-xxm-gold/60 animate-scroll-bounce"
          aria-hidden
        />
      </div>

      {/* ── Bottom gradient bleed into next section ──────────────── */}
      <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-xxm-champagne-200 to-transparent z-10 pointer-events-none" aria-hidden />
    </section>
  )
}
