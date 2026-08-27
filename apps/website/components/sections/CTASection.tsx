'use client'

import { ArrowRight, MessageCircle } from 'lucide-react'
import { useScrollReveal } from '@/hooks/useScrollReveal'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { APP_URL, adminWhatsAppUrl } from '@/lib/utils'

export function CTASection() {
  const revealRef = useScrollReveal(0.15)

  return (
    <section
      ref={revealRef}
      id="cta"
      className="relative py-20 md:py-32 px-4 md:px-8 overflow-hidden bg-xxm-champagne-50"
      aria-labelledby="cta-heading"
    >
      <div className="max-w-screen-lg mx-auto">
        <div className="reveal relative rounded-3xl bg-xxm-green-950 overflow-hidden">

          {/* animated border glow */}
          <div
            className="absolute inset-0 rounded-3xl border-2 border-xxm-gold/20 animate-border-glow pointer-events-none"
            aria-hidden
          />

          {/* background orbs */}
          <div
            className="absolute top-0 right-0 w-[500px] h-[500px] rounded-full opacity-10 animate-orb-drift-1 pointer-events-none"
            style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 65%)' }}
            aria-hidden
          />
          <div
            className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full opacity-8 animate-orb-drift-2 pointer-events-none"
            style={{ background: 'radial-gradient(circle, #2C5F47 0%, transparent 65%)' }}
            aria-hidden
          />
          <div className="noise-overlay rounded-3xl" aria-hidden />

          {/* content */}
          <div className="relative z-10 flex flex-col items-center text-center px-8 md:px-16 py-16 md:py-20 gap-8">

            {/* floating logo */}
            <div className="animate-float">
              <XmmLogo size={64} />
            </div>

            <div>
              <h2
                id="cta-heading"
                className="font-display text-4xl md:text-5xl font-black text-white leading-tight"
              >
                Ready to build{' '}
                <span className="text-shimmer">wealth together?</span>
              </h2>
              <p className="mt-5 text-white/55 text-base md:text-lg max-w-lg mx-auto leading-relaxed">
                Xkimi Xa Mali Foundation is an invite-only platform. If you&rsquo;re already a member,
                sign in to your account. If you&rsquo;d like to connect with the brotherhood,
                reach us on WhatsApp.
              </p>
            </div>

            {/* action buttons */}
            <div className="flex flex-col sm:flex-row gap-4 w-full justify-center max-w-md">
              <a
                href={`${APP_URL}/login`}
                className="btn-primary flex-1 inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-2xl bg-xxm-gold text-xxm-green-950 font-bold text-base shadow-gold"
              >
                Sign In to Your Account
                <ArrowRight size={16} aria-hidden />
              </a>

              <a
                href={adminWhatsAppUrl('Hi, I would like to join the Xkimi Xa Mali Foundation group. Please add me.')}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary flex-1 inline-flex items-center justify-center gap-2.5 px-7 py-4 rounded-2xl border border-white/20 text-white/80 font-semibold text-base"
              >
                <MessageCircle size={16} aria-hidden />
                Join WhatsApp
              </a>
            </div>

            {/* divider */}
            <div className="w-full max-w-xs h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* secondary actions row */}
            <div className="flex flex-wrap items-center justify-center gap-6">
              <a
                href={`${APP_URL}/dashboard`}
                className="text-white/55 hover:text-white/80 text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                Member portal
                <ArrowRight size={12} aria-hidden />
              </a>
              <a
                href={`${APP_URL}/support`}
                className="text-white/55 hover:text-white/80 text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                Support
                <ArrowRight size={12} aria-hidden />
              </a>
            </div>

            <p className="text-white/20 text-xs italic">
              &ldquo;Blessed is the hand that giveth.&rdquo; — Acts 20:35
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
