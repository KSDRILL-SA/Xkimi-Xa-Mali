import Image from 'next/image'
import { ArrowRight, ChevronDown, MessageCircle, Shield, TrendingUp, Users } from 'lucide-react'
import { APP_URL, adminWhatsAppUrl } from '@/lib/utils'

export function HeroSection() {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex flex-col overflow-hidden"
      aria-labelledby="hero-headline"
    >
      {/* ── Background image ──────────────────────────────────────── */}
      <div className="absolute inset-0 z-0">
        <Image
          src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1920&q=80"
          alt=""
          fill
          priority
          quality={90}
          className="object-cover object-center"
          sizes="100vw"
        />

        {/* layered overlays for depth */}
        <div className="absolute inset-0 bg-xxm-green-950/75" />
        <div className="absolute inset-0 bg-gradient-to-b from-xxm-green-950/30 via-transparent to-xxm-green-950/90" />
        <div className="absolute inset-0 bg-gradient-to-r from-xxm-green-950/60 via-transparent to-xxm-green-950/40" />

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
      <div className="relative z-10 flex-1 flex flex-col justify-center px-4 md:px-8 max-w-screen-xl mx-auto w-full pt-28 pb-12">
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
            className="text-5xl sm:text-6xl md:text-7xl font-black text-white leading-[1.05] tracking-tight mb-6"
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
            Xkimm Xa Mali is a private, invite-only collective financial platform built
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
              href={adminWhatsAppUrl('Hi, I would like to join the Xkimm Xa Mali group. Please add me.')}
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
              { icon: Users,      label: '4 Members',         sub: 'Brotherhood' },
              { icon: TrendingUp, label: 'R100+ / Month',     sub: 'Per member' },
              { icon: Shield,     label: 'DebiCheck Verified', sub: 'Netcash' },
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
