import { ChevronDown, MessageCircle, Shield, TrendingUp, Users } from 'lucide-react'
import { adminWhatsAppUrl } from '@/lib/utils'
import { getPublicStats } from '@/lib/stats'
import { FoundersBackdrop } from './FoundersBackdrop'
import { AmbientOrbs } from './AmbientOrbs'
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
      <AmbientOrbs />

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
          *behind* this same text. Anchoring to the top, rather than centring
          a variable-height block, is what makes the top of this stack
          predictable; what makes the BOTTOM of it predictable — clear of the
          photo's own name band regardless of how tall the top ends up being —
          is the split described below. */}
      <div
        className="relative z-10 flex-1 flex flex-col justify-start md:justify-center px-4 md:px-8 max-w-screen-xl mx-auto w-full pb-16 md:pb-12 pt-[calc(var(--nav-height)+1rem)] md:pt-[calc(var(--nav-height)+2.5rem)]"
      >
        {/* ── Two independently-anchored groups, not one long stack ──────
            Third time this exact collision has been reported. The first two
            passes each added another margin value and each one eventually
            drifted wrong again, because the stat pills' position was a
            function of everything stacked above them — remove a paragraph,
            remove a button, and the pills land somewhere new, over the
            photo's name band, without anything about the pills themselves
            having changed. A value tuned against today's content is a value
            that breaks the next time the content above it does.

            So mobile no longer has one stack whose last item's position is
            whatever the content above it leaves behind. It has two:

              - a TOP group (badge, headline) that flows normally from the
                page's top, exactly as before;
              - a BOTTOM group (the CTA, the stat pills) pinned to the
                bottom of the available space via `mt-auto` — a flex
                property, which is why this wrapper is `flex flex-col` on
                mobile — and given its own explicit clearance
                (`--founder-caption-zone`, the same constant
                FoundersBackdrop reads to reserve that zone in the first
                place) from the true bottom of the screen.

            The bottom group's position now depends on the viewport and that
            one shared constant — not on the top group's height. Change the
            headline, add a badge, anything: the bottom group holds its
            clearance regardless, because it is no longer computed from what
            happens to be above it.

            `md:block` on this wrapper cancels the flex context entirely
            above `md:`, where `mt-auto` has no meaning in normal flow and
            both groups render exactly as plain stacked children — identical
            to how they rendered before this split, because desktop was
            never the problem: the photo sits beside the text there, not
            behind it, so there is no name band on that side to collide
            with. */}
        <div className="flex flex-col flex-1 md:block max-w-3xl">

          <div>
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
            className="font-display text-5xl sm:text-6xl md:text-7xl font-black text-white leading-[1.05] tracking-tight mb-8 md:mb-6"
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

          {/* subheadline — desktop only.
              A phone hero showing badge, three-line headline, this
              paragraph, two buttons and three stat pills before the fold is
              too much competing for the same few hundred pixels of height —
              it reads as crowded rather than considered, which is the exact
              opposite of the first impression this section exists to make.
              Cut here, not lost: Mission and Features further down carry the
              same explanation, a scroll away, and the Sign In link this
              paragraph used to sit above stays reachable from the nav's own
              mobile pill row regardless. Desktop has the room and keeps it. */}
          <p
            className="hidden md:block text-white/65 md:text-xl leading-relaxed max-w-xl mb-10 animate-fade-in-up"
            style={{ animationDelay: '0.65s' }}
          >
            Xkimi Xa Mali Foundation is a private, invite-only collective financial platform built
            on the African principle that{' '}
            <em className="text-xxm-gold/90 not-italic font-semibold">
              money moves faster and further when it moves together.
            </em>
          </p>
          </div>

          {/* ── Bottom group: CTA + stat pills ────────────────────────
              `mt-auto` pushes this to the bottom of the flex column above —
              inert on desktop (`md:mt-0`), where the wrapper isn't a flex
              container in the first place. `pb-[...]` adds real clearance
              past `--founder-caption-zone` (not exactly it): the photo is
              *letterboxed* into that reserved frame — `object-contain`
              keeps its whole card visible rather than cropping it, which
              means the card doesn't necessarily fill the frame edge to
              edge, and the caption baked into the card could sit anywhere
              within it depending on that photo's own proportions. The
              extra margin is deliberate headroom against that uncertainty,
              not a second guessed number standing in for the first. */}
          <div className="mt-auto md:mt-0 pb-[calc(var(--founder-caption-zone)+2rem)] md:pb-0">

          {/* CTA row — one action, at every size.
              Used to carry Sign In alongside Join WhatsApp. Removed: the
              Navbar already owns Sign In everywhere — the top bar from
              `lg:` up, a "Sign In →" pill in its own mobile scroll row below
              that, and again in the mobile menu — so between `md:` (where
              this button used to appear) and `lg:` (where the Navbar's own
              switches on), a visitor saw two separate Sign In prompts on
              screen at once: the nav's pill just under the header, and this
              button a few hundred pixels down. A professional hero has
              exactly one thing it is asking a new visitor to do; Sign In is
              for an existing member, and that belongs to the nav, not here.

              What's left is the one action this section actually exists to
              drive for a first-time visitor — joining — styled as the
              confident, singular thing it now is: full width on the
              smallest screens so it reads as *the* answer rather than one
              option among several, a soft ambient glow instead of a flat
              drop shadow, and `.btn-shine` for a single sweep of light on
              hover/focus rather than anything that runs on a loop. */}
          <div
            className="flex flex-wrap gap-4 mb-8 md:mb-16 animate-fade-in-up"
            style={{ animationDelay: '0.8s' }}
          >
            <div className="relative w-full sm:w-auto">
              {/* Ambient glow, behind the button rather than on it: a second,
                  larger, heavily blurred copy of the same gold, so the button
                  reads as lit from within instead of merely bordered. `-z-10`
                  relative to this wrapper keeps it strictly behind; `inset-0`
                  plus `scale-110` lets it bloom a little past the button's own
                  edges rather than stopping exactly at them. */}
              <span
                className="absolute inset-0 -z-10 scale-110 rounded-2xl bg-xxm-gold/40 blur-xl"
                aria-hidden
              />
              <a
                href={adminWhatsAppUrl('Hi, I would like to join the Xkimi Xa Mali Foundation group. Please add me.')}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary btn-shine w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 rounded-2xl bg-xxm-gold text-xxm-green-950 font-bold text-base shadow-gold"
              >
                <MessageCircle size={18} aria-hidden />
                Join WhatsApp
              </a>
            </div>
          </div>

          {/* stat pills */}
          {/* Owner's explicit call, overriding the earlier horizontal-scroll
              decision below: three pills genuinely don't fit one row on a
              narrow phone, and side-scrolling a row of stat pills reads as
              broken rather than intentional — worse than one pill sitting on
              its own second line. So: grid-cols-2 on mobile (two pills top,
              the third spans the full row underneath it), a single
              non-wrapping row again from `sm:` up, where three pills already
              fit comfortably and the original scroll/nowrap behavior is kept.

              Just `mt-2` — plain visual spacing from the CTA above it, the
              same at every size. Clearance from the founder photo's name
              band is no longer this margin's job: it used to be, briefly,
              and that was exactly the fragility that put this row on top
              of the photo's caption in the first place — a value tuned to
              clear whatever happened to be stacked above it, broken the
              next time that content changed. That job now belongs to the
              bottom group's own `pb-[...]` (see above this pills row's
              wrapping div), which is anchored to the viewport and a shared
              constant, not to this row's neighbours.

              No more `animate-float`: three pills bobbing forever reads as
              busy rather than composed, and a credential — "bank-
              authenticated", a member count — earns more trust sitting
              still than gently wobbling in place indefinitely. They settle
              once their entrance finishes rather than continuing to move
              for as long as the page stays open. */}
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
                className={`glass flex items-center gap-3 px-4 py-3 rounded-2xl sm:shrink-0 ${isOddOneOut(i) ? 'col-span-2 sm:col-span-1' : ''}`}
              >
                <div className="w-8 h-8 rounded-xl bg-xxm-gold/15 flex items-center justify-center shrink-0">
                  <Icon size={15} className="text-xxm-gold" aria-hidden />
                </div>
                {/*
                  whitespace-nowrap on both lines: "DebiCheck Mandates" /
                  "Bank-authenticated" is noticeably longer than the other two
                  pills' text. Left free to wrap, that pill would be taller
                  than its siblings the moment it broke to a second line —
                  three pills meant to read as one consistent row, one
                  visibly a different shape from the other two. Forcing
                  single-line removes the height variance at the source
                  rather than correcting for it after the fact. Each pill can
                  still be as wide as it needs to be — on mobile its grid
                  column simply grows to fit it; on desktop the row has room
                  regardless.
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
