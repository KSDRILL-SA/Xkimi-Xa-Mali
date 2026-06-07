import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CheckCircle2,
  CreditCard,
  FileText,
  Handshake,
  Lock,
  MessageCircle,
  Quote,
  Shield,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'
import { Navbar } from '@/components/Navbar'
import { Footer } from '@/components/Footer'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { APP_URL, adminWhatsAppUrl } from '@/lib/utils'

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
    bio: 'The visionary behind Xkimm Xa Mali. Kurhula identified the need for a disciplined, technology-powered approach to communal savings and built the platform from the ground up.',
    initBg: 'bg-xxm-green text-white',
    ring: 'ring-xxm-green/25',
    accent: 'from-xxm-green/5',
  },
  {
    initials: 'NM',
    name: 'Maluleke Ntwanano Glen',
    title: 'Co-Founder & Treasurer',
    bio: 'The financial custodian of the collective. Ntwanano oversees financial integrity, ensures every contribution is accounted for, and guards the pool with unwavering discipline.',
    initBg: 'bg-xxm-gold text-xxm-green-900',
    ring: 'ring-xxm-gold/30',
    accent: 'from-xxm-gold/5',
  },
  {
    initials: 'RM',
    name: 'Malulele Risima Blessing',
    title: 'Co-Founder & Secretary',
    bio: 'The keeper of records and governance. Risima ensures operational excellence, maintains the standards of the collective, and holds every member accountable to the pact.',
    initBg: 'bg-xxm-canopy text-white',
    ring: 'ring-xxm-canopy/25',
    accent: 'from-xxm-canopy/5',
  },
  {
    initials: 'RN',
    name: 'Nkuna Rito Blessing',
    title: 'Co-Founder & Member Relations',
    bio: 'The heart of the brotherhood. Rito nurtures relationships within the collective, champions member welfare, and ensures Xkimm Xa Mali remains rooted in human trust.',
    initBg: 'bg-xxm-green-900 text-xxm-gold',
    ring: 'ring-xxm-green-900/20',
    accent: 'from-xxm-green-900/5',
  },
]

const pillars = [
  {
    icon: TrendingUp,
    num: '01',
    title: 'Contributing',
    description:
      'Every member commits to a monthly contribution, building financial discipline and consistency. No exceptions, no excuses — this is how lasting wealth begins.',
    accent: 'bg-xxm-green-50 border-xxm-green/15',
    iconBg: 'bg-xxm-green text-white',
    numColor: 'text-xxm-green/20',
  },
  {
    icon: Zap,
    num: '02',
    title: 'Growing',
    description:
      'Pooled contributions compound over time. The collective pursues shared goals — from emergency funds to long-term investment targets — growing wealth no individual could build alone.',
    accent: 'bg-xxm-gold/5 border-xxm-gold/20',
    iconBg: 'bg-xxm-gold text-xxm-green-900',
    numColor: 'text-xxm-gold/20',
  },
  {
    icon: Shield,
    num: '03',
    title: 'Securing',
    description:
      "Every rand is tracked. Every payment is audited. Every mandate is bank-verified. The platform protects the collective's money with the rigour of a proper financial institution.",
    accent: 'bg-xxm-champagne-200 border-xxm-gold/15',
    iconBg: 'bg-xxm-canopy text-white',
    numColor: 'text-xxm-canopy/20',
  },
]

const values = [
  {
    icon: Lock,
    title: 'Financial Discipline',
    body: 'The culture of Xkimm Xa Mali is built on non-negotiable commitment. Deadlines are respected. Amounts are honoured. Discipline is the foundation everything else rests on.',
  },
  {
    icon: Users,
    title: 'Stronger Together',
    body: "We operate on the age-old African wisdom of ubuntu — 'I am because we are.' What one person cannot achieve alone, four brothers can achieve together.",
  },
  {
    icon: Target,
    title: 'Securing Futures',
    body: 'Every contribution is a brick in a future built intentionally. We exist not just for today, but to create generational financial security for every member and their families.',
  },
  {
    icon: Handshake,
    title: 'Trust Above All',
    body: "Xkimm Xa Mali runs on trust. The technology enforces it. The governance backs it. But it all began with four men who chose to keep their word to each other.",
  },
]

const platformFeatures = [
  { icon: Lock,         heading: 'Invite-only access',     body: 'Membership is by invitation only. Every member is personally verified before they join the collective.' },
  { icon: CreditCard,   heading: 'Automated debits',       body: 'Monthly contributions are collected via Netcash DebiCheck — the same technology used by major banks. Zero manual transfers.' },
  { icon: Shield,       heading: 'Full audit trail',       body: 'Every action is logged. Every rand is traceable. Every admin decision is time-stamped and recorded for complete transparency.' },
  { icon: Target,       heading: 'Goal tracking',          body: 'Set collective financial goals, track progress in real time, and celebrate every milestone as a brotherhood.' },
  { icon: Bell,         heading: 'Instant notifications',  body: 'SMS, email, and push alerts keep every member informed of debits, overdue reminders, mandate status, and more.' },
  { icon: FileText,     heading: 'PDF statements',         body: 'Download formal payment statements for any contribution period — ready for records, financial planning, or tax purposes.' },
]

export default function AboutPage() {
  return (
    <>
      <Navbar />

      <main className="pt-[var(--nav-height)]">

        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-xxm-green pb-20 md:pb-28 pt-16 md:pt-24 px-4">
          {/* Gold orb overlays */}
          <div
            className="absolute -top-24 -right-24 w-[500px] h-[500px] rounded-full blur-3xl opacity-15 pointer-events-none"
            style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 65%)' }}
            aria-hidden
          />
          <div
            className="absolute bottom-0 -left-20 w-80 h-80 rounded-full blur-3xl opacity-10 pointer-events-none"
            style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)' }}
            aria-hidden
          />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full opacity-5 pointer-events-none"
            style={{ background: 'radial-gradient(circle, #2C5F47 0%, transparent 60%)' }}
            aria-hidden
          />

          <div className="relative max-w-screen-md mx-auto text-center flex flex-col items-center gap-6">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-white/45 hover:text-xxm-gold text-sm font-medium transition-colors group"
            >
              <ArrowLeft size={14} aria-hidden className="group-hover:-translate-x-0.5 transition-transform" />
              Back to home
            </Link>

            <div className="animate-float">
              <XmmLogo size={80} />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 bg-xxm-gold/15 border border-xxm-gold/25 rounded-full px-4 py-1.5 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-xxm-gold animate-pulse" aria-hidden />
                <span className="text-xxm-gold text-xs font-bold tracking-widest uppercase">Private · Invite-Only · Brotherhood</span>
              </div>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-[1.05]">
                Xkimm Xa Mali
              </h1>
              <p className="text-xxm-gold text-sm font-bold tracking-widest uppercase mt-2">
                Contributing · Growing · Securing
              </p>
            </div>

            <div className="flex flex-col items-center gap-3 pt-2">
              <div className="w-10 h-10 rounded-full bg-xxm-gold/15 border border-xxm-gold/25 flex items-center justify-center">
                <Quote size={16} className="text-xxm-gold" aria-hidden />
              </div>
              <p className="text-white/80 text-lg italic leading-relaxed max-w-sm font-medium">
                &ldquo;Blessed is the hand that giveth.&rdquo;
              </p>
              <cite className="text-xxm-gold/60 text-xs not-italic font-bold tracking-widest uppercase">
                Acts 20:35
              </cite>
            </div>

            <p className="text-white/55 text-base max-w-md leading-relaxed mt-2">
              A private, invite-only collective financial platform built by four brothers united
              by discipline, brotherhood, and an unshakeable vision for shared wealth.
            </p>

            {/* Trust signals */}
            <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
              {['4 Founding Members', 'Netcash DebiCheck', '100% Automated', 'Full Audit Trail'].map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-full px-3 py-1.5 text-white/60 text-xs font-semibold"
                >
                  <CheckCircle2 size={11} className="text-xxm-gold" aria-hidden />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── Section divider ───────────────────────────────────────── */}
        <div className="h-px bg-gradient-to-r from-transparent via-xxm-gold/20 to-transparent" />

        {/* ── Our Story ─────────────────────────────────────────────── */}
        <section className="py-20 md:py-28 px-4 bg-white">
          <div className="max-w-screen-md mx-auto">
            <div className="flex flex-col items-center text-center mb-12 gap-3">
              <span className="inline-flex items-center gap-2 bg-xxm-gold/10 border border-xxm-gold/20 rounded-full px-4 py-1.5 text-xxm-gold-dark text-xs font-bold tracking-widest uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-xxm-gold" aria-hidden />
                Our story
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-xxm-green-900 tracking-tight leading-tight">
                How it all began
              </h2>
            </div>

            <div className="space-y-6 text-gray-600 text-base leading-loose max-w-prose mx-auto">
              <p className="text-lg text-gray-700 font-medium leading-relaxed">
                Xkimm Xa Mali was born from a conversation between four men who shared a common
                frustration: despite earning consistently, individual financial progress felt slow,
                scattered, and unaccountable.
              </p>
              <p>
                They recognised what generations of their people had always known — that money moves
                faster and further when it moves together. Rooted in the age-old African wisdom of
                ubuntu, Xkimm Xa Mali was conceived as something more than ordinary group savings:
                a structured, transparent, technology-powered platform that takes the principle of
                collective financial discipline and gives it the rigour, accountability, and
                automation of a proper financial institution.
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
            <div className="mt-14 bg-xxm-green rounded-3xl p-8 md:p-10 text-center relative overflow-hidden">
              <div
                className="absolute inset-0 opacity-10 pointer-events-none"
                style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, #D4AF37 0%, transparent 50%)' }}
                aria-hidden
              />
              <Quote size={28} className="text-xxm-gold/40 mx-auto mb-5" aria-hidden />
              <p className="text-white text-xl sm:text-2xl font-bold leading-relaxed italic max-w-lg mx-auto">
                &ldquo;A collective financial pact built on trust, brotherhood, and a shared
                vision for building wealth.&rdquo;
              </p>
              <p className="text-xxm-gold/60 text-xs mt-5 tracking-widest uppercase font-bold">
                — The Founding Principle
              </p>
            </div>
          </div>
        </section>

        {/* ── Three Pillars ─────────────────────────────────────────── */}
        <section className="py-20 md:py-28 px-4 bg-xxm-champagne">
          <div className="max-w-screen-lg mx-auto">
            <div className="flex flex-col items-center text-center mb-14 gap-3">
              <span className="inline-flex items-center gap-2 bg-xxm-gold/10 border border-xxm-gold/20 rounded-full px-4 py-1.5 text-xxm-gold-dark text-xs font-bold tracking-widest uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-xxm-gold" aria-hidden />
                What we stand for
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-xxm-green-900 tracking-tight leading-tight">
                Three pillars, one purpose
              </h2>
              <p className="text-gray-500 text-base max-w-sm leading-relaxed">
                Every decision, feature, and rule inside Xkimm Xa Mali flows from these three principles.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {pillars.map(({ icon: Icon, num, title, description, accent, iconBg, numColor }) => (
                <div key={title} className={`relative rounded-2xl border p-7 flex flex-col gap-5 overflow-hidden ${accent}`}>
                  <span className={`absolute top-4 right-5 text-6xl font-black leading-none select-none ${numColor}`} aria-hidden>
                    {num}
                  </span>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${iconBg}`}>
                    <Icon size={22} aria-hidden />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-xxm-green-900 mb-2 leading-snug">{title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Founders ──────────────────────────────────────────────── */}
        <section className="py-20 md:py-28 px-4 bg-white">
          <div className="max-w-screen-lg mx-auto">
            <div className="flex flex-col items-center text-center mb-14 gap-3">
              <span className="inline-flex items-center gap-2 bg-xxm-gold/10 border border-xxm-gold/20 rounded-full px-4 py-1.5 text-xxm-gold-dark text-xs font-bold tracking-widest uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-xxm-gold" aria-hidden />
                The brotherhood
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-xxm-green-900 tracking-tight leading-tight">
                Meet the founders
              </h2>
              <p className="text-gray-500 text-base max-w-md leading-relaxed">
                Four men. One pact. A platform built from scratch with nothing but discipline,
                vision, and each other&rsquo;s word.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {founders.map(({ initials, name, title, bio, initBg, ring, accent }) => (
                <div
                  key={name}
                  className={`relative overflow-hidden bg-white rounded-2xl border border-xxm-gold/10 p-6 flex flex-col sm:flex-row gap-5 ring-2 ${ring} hover:shadow-gold transition-all duration-300 group`}
                >
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${accent} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none`}
                    aria-hidden
                  />
                  <div className={`relative w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-black shrink-0 shadow-sm ${initBg}`} aria-hidden>
                    {initials}
                  </div>
                  <div className="relative flex-1 min-w-0">
                    <p className="font-black text-xxm-green-900 text-base leading-snug">{name}</p>
                    <p className="text-xxm-gold-dark text-xs font-bold uppercase tracking-widest mt-0.5 mb-3">
                      {title}
                    </p>
                    <p className="text-sm text-gray-500 leading-relaxed">{bio}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Ubuntu callout */}
            <div className="mt-12 text-center">
              <div className="inline-block rounded-2xl bg-xxm-champagne border border-xxm-gold/15 px-8 py-6 max-w-lg">
                <p className="text-xxm-green-900 text-base italic font-semibold leading-relaxed">
                  &ldquo;I am because we are — together we build what none of us could build alone.&rdquo;
                </p>
                <p className="text-xxm-gold-dark text-xs mt-3 font-bold tracking-widest uppercase not-italic">
                  Ubuntu — The founding principle
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Values ────────────────────────────────────────────────── */}
        <section className="py-20 md:py-28 px-4 bg-xxm-green relative overflow-hidden">
          <div
            className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full opacity-8 pointer-events-none"
            style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 65%)' }}
            aria-hidden
          />
          <div className="relative max-w-screen-lg mx-auto">
            <div className="flex flex-col items-center text-center mb-14 gap-3">
              <span className="inline-flex items-center gap-2 bg-xxm-gold/15 border border-xxm-gold/25 rounded-full px-4 py-1.5 text-xxm-gold text-xs font-bold tracking-widest uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-xxm-gold" aria-hidden />
                Core values
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
                The principles we build on
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {values.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-2xl bg-white/5 border border-white/10 p-6 flex gap-4 hover:bg-white/10 hover:border-xxm-gold/20 transition-all duration-300 group"
                >
                  <div className="w-11 h-11 rounded-xl bg-xxm-gold/15 border border-xxm-gold/20 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-xxm-gold/20 transition-colors">
                    <Icon size={18} className="text-xxm-gold" aria-hidden />
                  </div>
                  <div>
                    <p className="font-black text-white text-base mb-2">{title}</p>
                    <p className="text-sm text-white/55 leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Platform Overview ─────────────────────────────────────── */}
        <section className="py-20 md:py-28 px-4 bg-xxm-champagne-50">
          <div className="max-w-screen-lg mx-auto">
            <div className="flex flex-col items-center text-center mb-14 gap-3">
              <span className="inline-flex items-center gap-2 bg-xxm-gold/10 border border-xxm-gold/20 rounded-full px-4 py-1.5 text-xxm-gold-dark text-xs font-bold tracking-widest uppercase">
                <span className="w-1.5 h-1.5 rounded-full bg-xxm-gold" aria-hidden />
                The platform
              </span>
              <h2 className="text-3xl sm:text-4xl font-black text-xxm-green-900 tracking-tight leading-tight">
                Built for serious savers
              </h2>
              <p className="text-gray-500 text-base leading-relaxed max-w-xl mx-auto">
                Xkimm Xa Mali is purpose-built software that automates every aspect of running a
                financial collective — from invite-gated onboarding to bank-verified debit mandates,
                from real-time contribution tracking to goal-based savings milestones.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {platformFeatures.map(({ icon: Icon, heading, body }) => (
                <div
                  key={heading}
                  className="group feature-card rounded-2xl bg-white border border-xxm-gold/10 p-6 flex flex-col gap-4 relative overflow-hidden hover:border-xxm-gold/30"
                >
                  <div
                    className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-xxm-gold/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-hidden
                  />
                  <div className="w-10 h-10 rounded-xl bg-xxm-green/8 flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-xxm-green" aria-hidden />
                  </div>
                  <div>
                    <p className="font-black text-xxm-green-900 text-sm mb-1.5">{heading}</p>
                    <p className="text-xs text-gray-500 leading-relaxed">{body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Inline sign-in CTA */}
            <div className="mt-12 text-center">
              <p className="text-gray-500 text-sm mb-4">Already a member? Your dashboard is waiting.</p>
              <a
                href={`${APP_URL}/login`}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-xxm-green text-white font-bold text-sm hover:bg-xxm-canopy transition-colors shadow-xxm"
              >
                Sign in to your account
                <ArrowRight size={15} aria-hidden />
              </a>
            </div>
          </div>
        </section>

        {/* ── Final CTA ─────────────────────────────────────────────── */}
        <section className="py-20 px-4 bg-xxm-green-950 relative overflow-hidden">
          <div
            className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full opacity-10 pointer-events-none"
            style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 65%)' }}
            aria-hidden
          />
          <div
            className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-8 pointer-events-none"
            style={{ background: 'radial-gradient(circle, #2C5F47 0%, transparent 65%)' }}
            aria-hidden
          />
          <div className="relative max-w-sm mx-auto text-center flex flex-col items-center gap-6">
            <div className="animate-float">
              <XmmLogo size={56} />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-black text-white leading-tight">Already a member?</h2>
              <p className="text-white/50 text-sm mt-2 leading-relaxed">
                This is a private platform. Access is by invitation only.
              </p>
            </div>
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <a
                href={`${APP_URL}/login`}
                className="btn-primary flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-xxm-gold text-xxm-green-950 font-bold text-sm shadow-gold"
              >
                Sign in to your account
                <ArrowRight size={15} aria-hidden />
              </a>
              <a
                href={adminWhatsAppUrl('Hi, I would like to join the Xkimm Xa Mali group. Please add me.')}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl border border-white/15 text-white/70 font-semibold text-sm hover:text-white hover:border-white/30 transition-colors"
              >
                <MessageCircle size={14} aria-hidden />
                Join our WhatsApp group
              </a>
            </div>
            <p className="text-white/20 text-xs italic mt-2">
              &ldquo;Blessed is the hand that giveth.&rdquo; — Acts 20:35
            </p>
          </div>
        </section>

      </main>

      <Footer />
    </>
  )
}
