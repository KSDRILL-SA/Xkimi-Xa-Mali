'use client'

import { CheckCircle2, CreditCard, MailOpen, MessageCircle, UserPlus } from 'lucide-react'
import { useScrollReveal } from '@/hooks/useScrollReveal'
import { WA_LINK } from '@/lib/utils'

const steps = [
  {
    step: '01',
    icon: MailOpen,
    title: 'Receive Your Invitation',
    description:
      'An existing member generates a personal XKM invitation code. You receive it via SMS or email — no public sign-ups, ever.',
    bg: 'bg-xxm-gold/10 border-xxm-gold/25',
    iconBg: 'bg-xxm-gold text-xxm-green-950',
    delay: 'delay-100',
  },
  {
    step: '02',
    icon: UserPlus,
    title: 'Complete Your Profile',
    description:
      'Set up your account with verified personal details, your South African bank account information, and notification preferences.',
    bg: 'bg-xxm-green/8 border-xxm-green/20',
    iconBg: 'bg-xxm-green text-white',
    delay: 'delay-200',
  },
  {
    step: '03',
    icon: CreditCard,
    title: 'Activate Your Debit Mandate',
    description:
      'Authorise your monthly contribution via Netcash DebiCheck — bank-verified and compliant. Set it once, contribute automatically.',
    bg: 'bg-xxm-canopy/8 border-xxm-canopy/20',
    iconBg: 'bg-xxm-canopy text-white',
    delay: 'delay-300',
  },
  {
    step: '04',
    icon: CheckCircle2,
    title: 'Build Wealth Together',
    description:
      "You're in. Your contributions are collected automatically, tracked in real time, and working toward the collective's financial goals.",
    bg: 'bg-xxm-gold/10 border-xxm-gold/25',
    iconBg: 'bg-xxm-green-950 text-xxm-gold',
    delay: 'delay-400',
  },
]

export function HowItWorksSection() {
  const revealRef = useScrollReveal(0.08)

  return (
    <section
      ref={revealRef}
      id="how-it-works"
      className="py-20 md:py-32 px-4 md:px-8 bg-white overflow-hidden"
      aria-labelledby="hiw-heading"
    >
      <div className="max-w-screen-xl mx-auto">

        {/* header */}
        <div className="text-center mb-16 reveal">
          <span className="inline-flex items-center gap-2 bg-xxm-gold/10 border border-xxm-gold/20 rounded-full px-4 py-1.5 text-xxm-gold-dark text-xs font-bold tracking-widest uppercase mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-xxm-gold" aria-hidden />
            The Journey
          </span>
          <h2
            id="hiw-heading"
            className="mt-1 text-4xl md:text-5xl font-black text-xxm-green-900 leading-tight"
          >
            From invitation to{' '}
            <span className="text-xxm-green">financial brotherhood</span>
          </h2>
          <p className="mt-5 text-gray-500 text-base md:text-lg max-w-xl mx-auto leading-relaxed">
            Four deliberate steps. Each one designed to ensure only committed,
            verified members enter the collective.
          </p>
        </div>

        {/* steps */}
        <div className="relative">

          {/* connecting gradient line — desktop only */}
          <div
            className="hidden lg:block absolute top-16 left-[12.5%] right-[12.5%] h-px"
            aria-hidden
          >
            <div className="h-full bg-gradient-to-r from-xxm-gold/20 via-xxm-gold/50 to-xxm-gold/20 reveal" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
            {steps.map(({ step, icon: Icon, title, description, bg, iconBg, delay }) => (
              <div
                key={step}
                className={`reveal ${delay} flex flex-col items-center text-center gap-5`}
              >
                {/* bubble with step badge */}
                <div className="relative">
                  <div className={`w-16 h-16 rounded-2xl border-2 ${bg} flex items-center justify-center shadow-xxm-sm`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
                      <Icon size={20} aria-hidden />
                    </div>
                  </div>
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-xxm-green-950 text-xxm-gold text-[10px] font-black flex items-center justify-center border-2 border-white shadow-xxm-sm">
                    {step}
                  </span>
                </div>

                <div>
                  <h3 className="font-black text-xxm-green-900 text-lg mb-2 leading-snug">
                    {title}
                  </h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* bottom CTA — styled call-to-action after the steps */}
        <div className="mt-16 reveal delay-500 flex flex-col sm:flex-row items-center justify-center gap-4">
          <div className="text-center sm:text-left">
            <p className="font-bold text-xxm-green-900 text-base">Ready to join the brotherhood?</p>
            <p className="text-gray-500 text-sm mt-0.5">Reach out to an existing member for your invitation code.</p>
          </div>

          <a
            href={WA_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex items-center gap-2.5 px-6 py-3 rounded-2xl bg-xxm-green text-white font-bold text-sm shadow-xxm whitespace-nowrap shrink-0"
          >
            <MessageCircle size={16} aria-hidden />
            Connect on WhatsApp
          </a>
        </div>
      </div>
    </section>
  )
}
