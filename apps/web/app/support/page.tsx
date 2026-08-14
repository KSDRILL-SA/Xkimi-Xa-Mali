import type { Metadata } from 'next'
import Link from 'next/link'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { AppFooter } from '@/components/layout/AppFooter'
import { ArrowLeft, MessageCircle, Mail, HelpCircle, Users, FileText, Shield } from 'lucide-react'
import { env } from '@/lib/env'

export const metadata: Metadata = {
  title: 'Support',
  description: 'Get help with the Xkimm Xa Mali Foundation platform.',
}

const faqs = [
  {
    q: 'How do I join the platform?',
    a: 'Xkimm Xa Mali Foundation is invite-only. You will receive a unique invitation code via SMS or email from an existing administrator. Use that code to complete your registration.',
  },
  {
    q: 'My debit order failed — what should I do?',
    a: 'Log in to the platform and navigate to Contributions. Check your mandate status under the Mandates section. Ensure your bank account has sufficient funds and that your DebiCheck mandate is active. If you need to update your banking details, contact an administrator.',
  },
  {
    q: 'How do I download my contribution statement?',
    a: 'Go to Dashboard → Statements. Select the date range you need and click "Download PDF". Your statement will include a full breakdown of all contributions, statuses, and amounts for the selected period.',
  },
  {
    q: 'I forgot my password — how do I reset it?',
    a: 'On the login page, click "Forgot password" and enter your registered email address. You will receive a password reset link valid for 24 hours. Check your spam folder if it doesn\'t arrive within a few minutes.',
  },
  {
    q: 'How do I update my notification preferences?',
    a: 'Go to Dashboard → Profile and scroll to the Notifications section. You can toggle SMS, email, and push notifications independently for different event types.',
  },
  {
    q: 'My account is showing as suspended — what does this mean?',
    a: 'Account suspension is usually triggered by repeated missed contributions or an administrative decision. Contact an administrator directly via WhatsApp for resolution.',
  },
]

export default function SupportPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-xxm-champagne">
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-xxm-green border-b border-white/10 shadow-xxm">
        <div className="h-16 flex items-center gap-4 px-4 md:px-8 max-w-screen-xl mx-auto">
          <Link
            href="/about"
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold rounded"
            aria-label="Back"
          >
            <ArrowLeft size={16} aria-hidden />
            <span className="hidden sm:inline">Back</span>
          </Link>
          <Link href="/" className="flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold rounded-lg" aria-label="Xkimm Xa Mali Foundation home">
            <XmmLogo size={32} />
            <span className="font-bold text-white text-sm hidden sm:block">Xkimm Xa Mali Foundation</span>
          </Link>
        </div>
      </header>

      <main className="flex-1">
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-xxm-green py-14 md:py-20 px-4">
          <div
            className="absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl opacity-20 pointer-events-none"
            style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)' }}
            aria-hidden
          />
          <div
            className="absolute -bottom-12 -left-12 w-56 h-56 rounded-full blur-3xl opacity-15 pointer-events-none"
            style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)' }}
            aria-hidden
          />
          <div className="relative max-w-screen-md mx-auto text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-xxm-gold/15 mb-5">
              <HelpCircle size={24} className="text-xxm-gold" aria-hidden />
            </div>
            <p className="text-xs font-bold text-xxm-gold tracking-widest uppercase mb-2">Help Centre</p>
            <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">
              Support
            </h1>
            <p className="text-white/75 text-[15px] leading-relaxed mt-4 max-w-lg mx-auto">
              Need help? Start with the FAQs below. For anything else, reach out to the
              platform administrators directly via WhatsApp.
            </p>
          </div>
        </section>

        <div className="py-12 md:py-16 px-4">
        <div className="max-w-screen-md mx-auto space-y-12">
          {/* Contact cards */}
          <div>
            <h2 className="flex items-center gap-2 text-xs font-bold text-xxm-gold-dark tracking-widest uppercase mb-4">
              Get in touch
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <a
                href={
                  env.ADMIN_WHATSAPP_NUMBER
                    ? `https://wa.me/${env.ADMIN_WHATSAPP_NUMBER}?text=${encodeURIComponent('Hi, I need support with my Xkimm Xa Mali Foundation account. Please assist me.')}`
                    : env.WHATSAPP_GROUP_LINK
                }
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-5 flex items-start gap-4 hover:border-xxm-gold/30 hover:shadow-xxm transition-all group"
              >
                <div className="w-11 h-11 rounded-xl bg-xxm-green-50 flex items-center justify-center shrink-0 group-hover:bg-xxm-green-100 transition-colors">
                  <MessageCircle size={19} className="text-xxm-green" aria-hidden />
                </div>
                <div>
                  <p className="font-bold text-xxm-green-900 group-hover:text-xxm-green transition-colors">
                    Message Admin on WhatsApp
                  </p>
                  <p className="text-xs text-xxm-gray-500 mt-0.5 leading-relaxed">
                    Chat directly with an administrator on WhatsApp for immediate assistance.
                  </p>
                </div>
              </a>

              <a
                href={`mailto:${env.SUPPORT_EMAIL}`}
                className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-5 flex items-start gap-4 hover:border-xxm-gold/30 hover:shadow-xxm transition-all group"
              >
                <div className="w-11 h-11 rounded-xl bg-xxm-champagne-200 flex items-center justify-center shrink-0 group-hover:bg-xxm-champagne-300 transition-colors">
                  <Mail size={19} className="text-xxm-green-700" aria-hidden />
                </div>
                <div>
                  <p className="font-bold text-xxm-green-900 group-hover:text-xxm-green transition-colors">
                    Email Support
                  </p>
                  <p className="text-xs text-xxm-gray-500 mt-0.5 leading-relaxed">
                    For non-urgent queries, email us. We respond within 1–2 business days.
                  </p>
                </div>
              </a>
            </div>
          </div>

          {/* FAQs */}
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black text-xxm-green-900 mb-5">
              <span className="inline-flex w-9 h-9 rounded-xl bg-xxm-gold/15 items-center justify-center shrink-0">
                <HelpCircle size={17} className="text-xxm-gold-dark" aria-hidden />
              </span>
              Frequently Asked Questions
            </h2>
            <div className="space-y-3">
              {faqs.map(({ q, a }, i) => (
                <div
                  key={q}
                  className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-5 hover:border-xxm-gold/20 hover:shadow-xxm transition-all"
                >
                  <p className="font-bold text-xxm-green-900 mb-2 text-sm flex items-baseline gap-2.5">
                    <span className="text-xxm-gold-dark text-xs font-black tabular-nums shrink-0">{String(i + 1).padStart(2, '0')}</span>
                    {q}
                  </p>
                  <p className="text-sm text-xxm-gray-500 leading-relaxed pl-[26px]">{a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h2 className="flex items-center gap-2 text-xs font-bold text-xxm-gold-dark tracking-widest uppercase mb-4">
              More resources
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Link href="/about" className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-4 flex items-center gap-3 hover:border-xxm-gold/30 hover:shadow-xxm transition-all group">
                <span className="inline-flex w-9 h-9 rounded-xl bg-xxm-green-50 items-center justify-center shrink-0">
                  <Users size={15} className="text-xxm-green" aria-hidden />
                </span>
                <span className="text-sm font-medium text-xxm-gray-700 group-hover:text-xxm-green transition-colors">About the platform</span>
              </Link>
              <Link href="/privacy" className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-4 flex items-center gap-3 hover:border-xxm-gold/30 hover:shadow-xxm transition-all group">
                <span className="inline-flex w-9 h-9 rounded-xl bg-xxm-green-50 items-center justify-center shrink-0">
                  <Shield size={15} className="text-xxm-green" aria-hidden />
                </span>
                <span className="text-sm font-medium text-xxm-gray-700 group-hover:text-xxm-green transition-colors">Privacy Policy</span>
              </Link>
              <Link href="/terms" className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-4 flex items-center gap-3 hover:border-xxm-gold/30 hover:shadow-xxm transition-all group">
                <span className="inline-flex w-9 h-9 rounded-xl bg-xxm-green-50 items-center justify-center shrink-0">
                  <FileText size={15} className="text-xxm-green" aria-hidden />
                </span>
                <span className="text-sm font-medium text-xxm-gray-700 group-hover:text-xxm-green transition-colors">Terms of Use</span>
              </Link>
            </div>
          </div>
        </div>
        </div>
      </main>

      <AppFooter />
    </div>
  )
}
