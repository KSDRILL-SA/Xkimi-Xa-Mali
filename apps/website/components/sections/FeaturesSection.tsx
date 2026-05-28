'use client'

import {
  Bell,
  FileText,
  Lock,
  Shield,
  Target,
  TrendingUp,
  UserCheck,
  Zap,
} from 'lucide-react'
import { useScrollReveal } from '@/hooks/useScrollReveal'

const features = [
  {
    icon: Lock,
    title: 'Invite-Only Access',
    description:
      'Every member is personally invited by an existing member. No open registrations — only trusted brothers enter the collective.',
    accent: 'from-xxm-green/10 to-xxm-green/5',
    iconBg: 'bg-xxm-green text-white',
    delay: 'delay-100',
  },
  {
    icon: Zap,
    title: 'Automated Debit Orders',
    description:
      'Monthly contributions are collected via Netcash DebiCheck — the same technology banks use. Zero manual transfers, zero chasing.',
    accent: 'from-xxm-gold/10 to-xxm-gold/5',
    iconBg: 'bg-xxm-gold text-xxm-green-950',
    delay: 'delay-200',
  },
  {
    icon: Target,
    title: 'Goal-Based Savings',
    description:
      'Set collective financial milestones — emergency funds, investment pools, annual targets. Track real-time progress as a team.',
    accent: 'from-xxm-canopy/10 to-xxm-canopy/5',
    iconBg: 'bg-xxm-canopy text-white',
    delay: 'delay-300',
  },
  {
    icon: Bell,
    title: 'Instant Notifications',
    description:
      'SMS, email, and push alerts for every event — debit confirmations, overdue reminders, goal milestones, and admin broadcasts.',
    accent: 'from-xxm-green/10 to-xxm-green/5',
    iconBg: 'bg-xxm-green-800 text-xxm-gold',
    delay: 'delay-100',
  },
  {
    icon: FileText,
    title: 'PDF Statements',
    description:
      'Download formal contribution statements for any period — ready for personal records, tax purposes, or financial planning.',
    accent: 'from-xxm-gold/10 to-xxm-gold/5',
    iconBg: 'bg-xxm-gold-dark text-white',
    delay: 'delay-200',
  },
  {
    icon: Shield,
    title: 'Full Audit Trail',
    description:
      'Every action is logged. Every rand is traceable. Every admin decision is time-stamped and recorded for complete transparency.',
    accent: 'from-xxm-canopy/10 to-xxm-canopy/5',
    iconBg: 'bg-xxm-green-950 text-xxm-gold',
    delay: 'delay-300',
  },
  {
    icon: UserCheck,
    title: 'Member Dashboards',
    description:
      'Each member has a private dashboard showing their contribution history, mandate status, upcoming debits, and personal goals.',
    accent: 'from-xxm-green/10 to-xxm-green/5',
    iconBg: 'bg-xxm-canopy-light text-white',
    delay: 'delay-400',
  },
  {
    icon: TrendingUp,
    title: 'Admin Oversight',
    description:
      'The admin panel gives the chairman and treasurer full visibility — member management, mandate approvals, contribution reviews, and broadcast tools.',
    accent: 'from-xxm-gold/10 to-xxm-gold/5',
    iconBg: 'bg-xxm-green text-xxm-gold',
    delay: 'delay-500',
  },
]

export function FeaturesSection() {
  const ref = useScrollReveal(0.08) as React.MutableRefObject<HTMLElement>

  return (
    <section
      ref={ref as React.RefObject<HTMLDivElement>}
      id="features"
      className="py-20 md:py-32 px-4 md:px-8 bg-xxm-champagne-50"
      aria-labelledby="features-heading"
    >
      <div className="max-w-screen-xl mx-auto">

        {/* section header */}
        <div className="text-center mb-16 reveal">
          <span className="text-xxm-gold-dark text-xs font-bold tracking-widest uppercase">
            Platform Capabilities
          </span>
          <h2
            id="features-heading"
            className="mt-3 text-4xl md:text-5xl font-black text-xxm-green-900 leading-tight"
          >
            Everything a financial collective needs —{' '}
            <span className="text-xxm-green">built in.</span>
          </h2>
          <p className="mt-5 text-gray-500 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
            No spreadsheets. No WhatsApp reminders. No chasing payments. Xkimm Xa Mali automates
            the administration so the brotherhood can focus on growing.
          </p>
        </div>

        {/* feature grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map(({ icon: Icon, title, description, accent, iconBg, delay }) => (
            <div
              key={title}
              className={`reveal feature-card ${delay} relative rounded-2xl border border-xxm-gold/10 bg-gradient-to-br ${accent} p-6 flex flex-col gap-4 overflow-hidden group cursor-default`}
            >
              {/* hover top-line accent */}
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-xxm-gold/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" aria-hidden />

              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconBg} shadow-xxm-sm`}>
                <Icon size={20} aria-hidden />
              </div>

              <div>
                <h3 className="font-black text-xxm-green-900 text-base mb-2 leading-snug">
                  {title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
