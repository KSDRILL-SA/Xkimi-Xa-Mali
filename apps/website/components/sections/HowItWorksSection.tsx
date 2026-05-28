'use client'

import { CheckCircle2, CreditCard, MailOpen, UserPlus } from 'lucide-react'
import { useScrollReveal } from '@/hooks/useScrollReveal'

const steps = [
  {
    step: '01',
    icon: MailOpen,
    title: 'Receive Your Invitation',
    description:
      'An existing member generates a personal XKM invitation code. You receive it via SMS or email — no public sign-ups, ever.',
    color: 'text-xxm-gold',
    bg: 'bg-xxm-gold/10 border-xxm-gold/25',
    iconBg: 'bg-xxm-gold text-xxm-green-950',
  },
  {
    step: '02',
    icon: UserPlus,
    title: 'Complete Your Profile',
    description:
      'Set up your account with verified personal details, your South African bank account information, and notification preferences.',
    color: 'text-xxm-green-400',
    bg: 'bg-xxm-green/8 border-xxm-green/20',
    iconBg: 'bg-xxm-green text-white',
  },
  {
    step: '03',
    icon: CreditCard,
    title: 'Activate Your Debit Mandate',
    description:
      'Authorise your monthly contribution via Netcash DebiCheck — bank-verified and compliant. Set it once, contribute automatically.',
    color: 'text-xxm-canopy-light',
    bg: 'bg-xxm-canopy/8 border-xxm-canopy/20',
    iconBg: 'bg-xxm-canopy text-white',
  },
  {
    step: '04',
    icon: CheckCircle2,
    title: 'Build Wealth Together',
    description:
      "You're in. Your contributions are collected automatically, tracked in real time, and working toward the collective's financial goals.",
    color: 'text-xxm-gold',
    bg: 'bg-xxm-gold/10 border-xxm-gold/25',
    iconBg: 'bg-xxm-green-950 text-xxm-gold',
  },
]

export function HowItWorksSection() {
  const ref = useScrollReveal(0.08) as React.MutableRefObject<HTMLElement>

  return (
    <section
      ref={ref as React.RefObject<HTMLDivElement>}
      id="how-it-works"
      className="py-20 md:py-32 px-4 md:px-8 bg-white overflow-hidden"
      aria-labelledby="hiw-heading"
    >
      <div className="max-w-screen-xl mx-auto">

        {/* header */}
        <div className="text-center mb-16 reveal">
          <span className="text-xxm-gold-dark text-xs font-bold tracking-widest uppercase">
            The Journey
          </span>
          <h2
            id="hiw-heading"
            className="mt-3 text-4xl md:text-5xl font-black text-xxm-green-900 leading-tight"
          >
            From invitation to{' '}
            <span className="text-xxm-green">financial brotherhood</span>
          </h2>
          <p className="mt-5 text-gray-500 text-base md:text-lg max-w-xl mx-auto leading-relaxed">
            Four deliberate steps. Each one designed to ensure only committed,
            verified members enter the collective.
          </p>
        </div>

        {/* steps — desktop: horizontal row; mobile: vertical stack */}
        <div className="relative">

          {/* connecting line — desktop only */}
          <div
            className="hidden lg:block absolute top-16 left-[12.5%] right-[12.5%] h-px"
            aria-hidden
          >
            <div className="h-full bg-gradient-to-r from-xxm-gold/20 via-xxm-gold/50 to-xxm-gold/20 reveal" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
            {steps.map(({ step, icon: Icon, title, description, bg, iconBg }, i) => (
              <div
                key={step}
                className={`reveal flex flex-col items-center text-center gap-5 delay-${i * 150}`}
              >
                {/* step bubble */}
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
      </div>
    </section>
  )
}
