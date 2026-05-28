import type { Metadata } from 'next'
import Link from 'next/link'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { AppFooter } from '@/components/layout/AppFooter'
import {
  TrendingUp,
  Shield,
  Users,
  Target,
  ArrowRight,
  Quote,
  Handshake,
  Lock,
  Zap,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'About',
  description:
    'Learn about Xkimm Xa Mali — a collective financial platform built on trust, brotherhood, and shared wealth.',
}

const founders = [
  {
    initials: 'KM',
    name: 'Maluleke Kurhula Success',
    title: 'Founder & Chairman',
    bio: 'The visionary behind Xkimm Xa Mali. Kurhula identified the need for a disciplined, technology-powered approach to communal savings and brought the collective to life.',
    color: 'bg-xxm-green text-white',
    ring: 'ring-xxm-green/20',
  },
  {
    initials: 'NM',
    name: 'Maluleke Ntwanano Glen',
    title: 'Co-Founder & Treasurer',
    bio: 'The financial custodian of the collective. Ntwanano oversees financial integrity, ensures every contribution is accounted for, and guards the pool with discipline.',
    color: 'bg-xxm-gold text-xxm-green-900',
    ring: 'ring-xxm-gold/30',
  },
  {
    initials: 'RM',
    name: 'Malulele Risima Blessing',
    title: 'Co-Founder & Secretary',
    bio: 'The keeper of records and governance. Risima ensures operational excellence, maintains the standards of the collective, and holds every member accountable.',
    color: 'bg-xxm-canopy text-white',
    ring: 'ring-xxm-canopy/20',
  },
  {
    initials: 'RN',
    name: 'Nkuna Rito Blessing',
    title: 'Co-Founder & Member Relations',
    bio: 'The heart of the brotherhood. Rito nurtures relationships within the collective, champions member welfare, and ensures Xkimm Xa Mali remains rooted in trust.',
    color: 'bg-xxm-green-900 text-xxm-gold',
    ring: 'ring-xxm-green-900/20',
  },
]

const pillars = [
  {
    icon: TrendingUp,
    title: 'Contributing',
    description:
      'Every member commits to a monthly contribution, building financial discipline and consistency. No exceptions, no excuses — this is how wealth begins.',
    accent: 'bg-xxm-green-50 border-xxm-green/15',
    iconBg: 'bg-xxm-green text-white',
  },
  {
    icon: Zap,
    title: 'Growing',
    description:
      'Pooled contributions compound over time. The collective pursues shared goals — from emergency funds to long-term investment targets — growing wealth that no individual could build alone.',
    accent: 'bg-xxm-gold/5 border-xxm-gold/20',
    iconBg: 'bg-xxm-gold text-xxm-green-900',
  },
  {
    icon: Shield,
    title: 'Securing',
    description:
      "Every rand is tracked. Every payment is audited. Every mandate is verified. The platform exists to protect the collective's money with the same rigour a bank would.",
    accent: 'bg-xxm-champagne-200 border-xxm-gold/15',
    iconBg: 'bg-xxm-canopy text-white',
  },
]

const values = [
  {
    icon: Lock,
    title: 'Financial Discipline',
    body: 'The culture of Xkimm Xa Mali is built on non-negotiable commitment. Deadlines are respected. Amounts are honoured. Discipline is the foundation.',
  },
  {
    icon: Users,
    title: 'Stronger Together',
    body: "We operate on the age-old African wisdom of ubuntu — 'I am because we are.' What one person cannot achieve alone, four brothers can achieve together.",
  },
  {
    icon: Target,
    title: 'Securing Futures',
    body: 'Every contribution is a brick in a future that is built intentionally. We exist not just for today, but to create generational financial security.',
  },
  {
    icon: Handshake,
    title: 'Trust Above All',
    body: "Xkimm Xa Mali runs on trust. The technology enforces it, the governance backs it, but it begins with four men who chose to keep their word to each other.",
  },
]

export default function AboutPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-xxm-champagne">

      {/* ── Public nav ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-xxm-green border-b border-white/10 shadow-xxm">
        <div
          className="h-16 flex items-center justify-between gap-4 px-4 md:px-8 max-w-screen-xl mx-auto"
        >
          <Link
            href="/"
            className="flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold rounded-lg"
            aria-label="Xkimm Xa Mali home"
          >
            <XmmLogo size={36} />
            <span className="hidden sm:flex flex-col leading-none">
              <span className="font-bold text-white text-sm tracking-wide">Xkimm Xa Mali</span>
              <span className="text-white/45 text-[10px] tracking-widest uppercase mt-0.5">
                Contributing · Growing · Securing
              </span>
            </span>
          </Link>

          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-xxm-gold text-xxm-green-900 text-sm font-bold hover:bg-xxm-gold-dark transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Sign in
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      </header>

      <main className="flex-1">

        {/* ── Hero ────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-xxm-green py-20 md:py-32 px-4">
          {/* Background glow blobs */}
          <div
            className="absolute -top-24 -right-24 w-80 h-80 rounded-full blur-3xl opacity-20 pointer-events-none"
            style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)' }}
            aria-hidden
          />
          <div
            className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full blur-3xl opacity-15 pointer-events-none"
            style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)' }}
            aria-hidden
          />

          <div className="relative max-w-screen-md mx-auto text-center flex flex-col items-center gap-6">
            <XmmLogo size={80} />

            <div>
              <h1 className="text-4xl sm:text-5xl font-black text-white tracking-tight leading-tight">
                Xkimm Xa Mali
              </h1>
              <p className="text-xxm-gold text-sm font-semibold tracking-widest uppercase mt-2">
                Contributing · Growing · Securing
              </p>
            </div>

            <blockquote className="max-w-sm text-center">
              <div className="w-8 h-8 rounded-full bg-xxm-gold/20 flex items-center justify-center mx-auto mb-3">
                <Quote size={14} className="text-xxm-gold" aria-hidden />
              </div>
              <p className="text-white/80 text-base italic leading-relaxed">
                &ldquo;Blessed is the hand that giveth.&rdquo;
              </p>
              <cite className="text-xxm-gold/70 text-xs not-italic mt-1 block tracking-wide">
                — Acts 20:35
              </cite>
            </blockquote>

            <p className="text-white/60 text-sm max-w-md leading-relaxed">
              A private, invite-only collective financial platform built by four brothers united
              by discipline, brotherhood, and an unshakeable vision for shared wealth.
            </p>
          </div>
        </section>

        {/* ── Our Story ───────────────────────────────────────────────── */}
        <section className="py-16 md:py-24 px-4 bg-white">
          <div className="max-w-screen-md mx-auto">
            <div className="flex flex-col items-center text-center mb-10 gap-2">
              <span className="text-xs font-bold text-xxm-gold tracking-widest uppercase">
                Our story
              </span>
              <h2 className="text-3xl font-black text-xxm-green-900">How it all began</h2>
            </div>

            <div className="space-y-5 text-gray-600 text-[15px] leading-relaxed max-w-prose mx-auto">
              <p>
                Xkimm Xa Mali was born from a conversation between four men who shared a common
                frustration: despite earning consistently, individual financial progress felt slow,
                scattered, and unaccountable. They recognised what generations of their people had
                always known — that money moves faster and further when it moves together.
              </p>
              <p>
                Rooted in the South African tradition of the{' '}
                <em className="font-semibold text-xxm-green">stokvel</em> — the time-honoured
                practice of communal savings and collective upliftment — Xkimm Xa Mali was
                conceived as something more: a structured, transparent, technology-powered
                platform that would take the spirit of the stokvel and give it the discipline of a
                financial institution.
              </p>
              <p>
                The name itself is a Tsonga phrase representing the idea of collective financial
                purpose — a pact that money be treated with the seriousness it deserves. From
                monthly debit orders to automated contribution tracking, from goal-setting to
                real-time payment notifications, every feature of this platform exists to honour
                that original pact.
              </p>
              <p>
                What began as a WhatsApp group message between four friends has become a fully
                governed, audited, and automated financial collective — proof that with the right
                structure, brotherhood is enough to build wealth.
              </p>
            </div>

            {/* Pull quote */}
            <div className="mt-12 bg-xxm-green rounded-2xl p-8 text-center relative overflow-hidden">
              <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 80% 20%, #D4AF37 0%, transparent 50%)',
                }}
                aria-hidden
              />
              <Quote size={24} className="text-xxm-gold/50 mx-auto mb-4" aria-hidden />
              <p className="text-white text-lg sm:text-xl font-semibold leading-relaxed italic max-w-sm mx-auto">
                &ldquo;A collective financial pact built on trust, brotherhood, and a shared
                vision for building wealth.&rdquo;
              </p>
              <p className="text-xxm-gold/70 text-xs mt-4 tracking-widest uppercase font-medium">
                — The Founding Principle
              </p>
            </div>
          </div>
        </section>

        {/* ── Three pillars ────────────────────────────────────────────── */}
        <section className="py-16 md:py-24 px-4 bg-xxm-champagne">
          <div className="max-w-screen-lg mx-auto">
            <div className="flex flex-col items-center text-center mb-12 gap-2">
              <span className="text-xs font-bold text-xxm-gold tracking-widest uppercase">
                What we stand for
              </span>
              <h2 className="text-3xl font-black text-xxm-green-900">Three pillars, one purpose</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {pillars.map(({ icon: Icon, title, description, accent, iconBg }) => (
                <div
                  key={title}
                  className={`rounded-2xl border p-7 flex flex-col gap-5 ${accent}`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
                    <Icon size={22} aria-hidden />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-xxm-green-900 mb-2">{title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Founders ─────────────────────────────────────────────────── */}
        <section className="py-16 md:py-24 px-4 bg-white">
          <div className="max-w-screen-lg mx-auto">
            <div className="flex flex-col items-center text-center mb-12 gap-2">
              <span className="text-xs font-bold text-xxm-gold tracking-widest uppercase">
                The brotherhood
              </span>
              <h2 className="text-3xl font-black text-xxm-green-900">Meet the founders</h2>
              <p className="text-gray-500 text-sm max-w-md leading-relaxed mt-1">
                Four men. One pact. A platform built from scratch with nothing but discipline,
                vision, and each other&rsquo;s word.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {founders.map(({ initials, name, title, bio, color, ring }) => (
                <div
                  key={name}
                  className={`xxm-card p-6 flex flex-col sm:flex-row gap-5 ring-2 ${ring}`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black shrink-0 ${color}`}
                    aria-hidden
                  >
                    {initials}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xxm-green-900 text-base leading-snug">{name}</p>
                    <p className="text-xxm-gold-dark text-xs font-semibold uppercase tracking-widest mt-0.5 mb-3">
                      {title}
                    </p>
                    <p className="text-sm text-gray-500 leading-relaxed">{bio}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Values ───────────────────────────────────────────────────── */}
        <section className="py-16 md:py-24 px-4 bg-xxm-green">
          <div className="max-w-screen-lg mx-auto">
            <div className="flex flex-col items-center text-center mb-12 gap-2">
              <span className="text-xs font-bold text-xxm-gold tracking-widest uppercase">
                Core values
              </span>
              <h2 className="text-3xl font-black text-white">
                The principles we build on
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {values.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-2xl bg-white/5 border border-white/10 p-6 flex gap-4 hover:bg-white/10 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-xxm-gold/15 border border-xxm-gold/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon size={18} className="text-xxm-gold" aria-hidden />
                  </div>
                  <div>
                    <p className="font-bold text-white mb-1.5">{title}</p>
                    <p className="text-sm text-white/55 leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Platform overview ────────────────────────────────────────── */}
        <section className="py-16 md:py-24 px-4 bg-white">
          <div className="max-w-screen-md mx-auto text-center">
            <span className="text-xs font-bold text-xxm-gold tracking-widest uppercase">
              The platform
            </span>
            <h2 className="text-3xl font-black text-xxm-green-900 mt-2 mb-6">
              Built for serious savers
            </h2>

            <p className="text-gray-500 text-[15px] leading-relaxed mb-10 max-w-prose mx-auto">
              Xkimm Xa Mali is not a bank app, not a WhatsApp group, and not a spreadsheet. It is
              purpose-built software that automates every aspect of running a financial collective —
              from invite-gated onboarding to bank-verified debit mandates, from real-time
              contribution tracking to goal-based savings milestones.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left mb-10">
              {[
                {
                  heading: 'Invite-only access',
                  body: 'Membership is by invitation only. Every member is verified before they join.',
                },
                {
                  heading: 'Automated debits',
                  body: 'Monthly contributions are collected via Netcash DebiCheck — zero manual transfers.',
                },
                {
                  heading: 'Full audit trail',
                  body: 'Every action is logged. Every rand is traceable. Every admin decision is recorded.',
                },
                {
                  heading: 'Goal tracking',
                  body: 'Set collective financial goals, track progress in real time, and celebrate every milestone.',
                },
                {
                  heading: 'Instant notifications',
                  body: 'SMS, email, and push alerts keep every member informed — debit confirmations, overdue reminders, and more.',
                },
                {
                  heading: 'PDF statements',
                  body: 'Download formal payment statements for any period, ready for records or tax purposes.',
                },
              ].map(({ heading, body }) => (
                <div
                  key={heading}
                  className="rounded-xl bg-xxm-champagne-100 border border-xxm-gold/10 p-4"
                >
                  <p className="font-bold text-xxm-green-900 text-sm mb-1">{heading}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────── */}
        <section className="py-16 px-4 bg-xxm-champagne">
          <div className="max-w-sm mx-auto text-center flex flex-col items-center gap-5">
            <XmmLogo size={52} />
            <div>
              <h2 className="text-2xl font-black text-xxm-green-900">Already a member?</h2>
              <p className="text-gray-500 text-sm mt-2">
                This is a private platform. Access is by invitation only.
              </p>
            </div>
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-xxm-green text-white font-bold text-sm hover:bg-xxm-canopy transition-colors shadow-xxm"
            >
              Sign in to your account
              <ArrowRight size={15} aria-hidden />
            </Link>
            <p className="text-xs text-gray-400 italic">
              &ldquo;Blessed is the hand that giveth.&rdquo; — Acts 20:35
            </p>
          </div>
        </section>

      </main>

      <AppFooter />
    </div>
  )
}
