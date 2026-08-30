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
      {/* `--nav-height` is measured live off the header's real rendered box
          (see Navbar.tsx's `useLayoutEffect`), so it already includes both
          the top bar and, below `lg:`, the second row of section pills —
          this padding only needs a small buffer past it, not a guessed one. */}
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
          footprint predictable and clear of that zone. */}
      <div
        className="relative z-10 flex-1 flex flex-col justify-start md:justify-center px-4 md:px-8 max-w-screen-xl mx-auto w-full pb-16 md:pb-12 pt-[calc(var(--nav-height)+1rem)] md:pt-[calc(var(--nav-height)+2.5rem)]"
      >
        <div className="max-w-3xl">

          {/* badge */}
          <div
            className="inline-flex items-center gap-2 glass-gold rounded-full px-4 py-2 mb-6 md:mb-8 animate-fade-in-down"
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
            className="font-display text-5xl sm:text-6xl md:text-7xl font-black text-white leading-[1.05] tracking-tight mb-4 md:mb-6"
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
            className="text-white/65 text-lg md:text-xl leading-relaxed max-w-xl mb-4 md:mb-10 animate-fade-in-up"
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
            className="flex flex-wrap gap-4 mb-24 md:mb-16 animate-fade-in-up"
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
              // `.btn-secondary` is transparent by design everywhere else it's
              // used — here specifically, this button sits over the rotating
              // founder photo's own name band, close enough on some founders
              // that the caption showed straight through the glass. The
              // inline background (site's own dark green, not a shared class)
              // overrides it for this one instance without touching the
              // shared style other pages rely on.
              className="btn-secondary inline-flex items-center gap-2.5 px-7 py-3.5 rounded-2xl border border-white/20 text-white/80 font-semibold text-base hover:border-xxm-gold/40"
              style={{ background: 'rgba(5, 46, 22, 0.88)' }}
            >
              <MessageCircle size={16} aria-hidden />
              Join WhatsApp
            </a>
          </div>

          {/* floating stat pills */}
          {/* Owner's explicit call, overriding the earlier horizontal-scroll
              decision below: three pills genuinely don't fit one row on a
              narrow phone, and side-scrolling a row of stat pills reads as
              broken rather than intentional — worse than one pill sitting on
              its own second line. So: grid-cols-2 on mobile (two pills top,
              the third spans the full row underneath it), a single
              non-wrapping row again from `sm:` up, where three pills already
              fit comfortably and the original scroll/nowrap behavior is kept.

              The reason wrapping was avoided in the first place, still worth
              knowing: on mobile this whole text block sits *over* the
              founder photo's own name-and-title band baked into the image,
              and a taller block risks colliding with it depending on which
              of the four founders is showing. That risk is real but
              secondary to the owner's product call here — if it turns out to
              collide on a specific photo, the fix is more bottom padding on
              the photo's name band or an earlier vertical cutoff for this
              block, not reintroducing horizontal scroll. */}
          <div
            className="grid grid-cols-2 sm:flex sm:flex-nowrap gap-3 mt-2 animate-fade-in-up"
            style={{ animationDelay: '1s' }}
          >
            {(() => {
              const pills = [
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
                { icon: Shield, label: 'DebiCheck Mandates', sub: 'Bank-authenticated' },
              ]
              // An odd one out on mobile's 2-up grid — the third pill with no
              // partner beside it — spans both columns instead of sitting
              // alone in the left one with dead space to its right.
              const isOddOneOut = (i: number) => pills.length % 2 !== 0 && i === pills.length - 1

              return pills.map(({ icon: Icon, label, sub }, i) => (
              <div
                key={label}
                // items-center here (not just on the row) so each pill's own
                // icon+text is centered on ITS OWN box — doesn't depend on
                // every pill in the row happening to end up the same height.
                className={`glass flex items-center gap-3 px-4 py-3 rounded-2xl sm:shrink-0 animate-float ${isOddOneOut(i) ? 'col-span-2 sm:col-span-1' : ''}`}
              >
                <div className="w-8 h-8 rounded-xl bg-xxm-gold/15 flex items-center justify-center shrink-0">
                  <Icon size={15} className="text-xxm-gold" aria-hidden />
                </div>
                {/*
                  whitespace-nowrap on both lines: "DebiCheck Mandates" /
                  "Bank-authenticated" is noticeably longer than the other two
                  pills' text. If it ever wraps to a second line while its
                  siblings stay single-line, that pill is a different height
                  from the other two — and since animate-float's translateY
                  bob is measured from each box's own resting position, a
                  taller box's bob no longer lines up with its shorter
                  siblings' even though all three share the identical
                  keyframes. Forcing single-line removes the height variance
                  at the source rather than trying to compensate for it after
                  the fact. Each pill can still be as wide as it needs to be
                  — on mobile its grid column simply grows to fit it; on
                  desktop the row has room regardless.
                */}
                <div className="min-w-0">
                  <p className="text-white text-sm font-bold leading-none whitespace-nowrap">{label}</p>
                  <p className="text-white/45 text-[11px] mt-0.5 whitespace-nowrap">{sub}</p>
                </div>
              </div>
              ))
            })()}
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
