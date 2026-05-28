import type { Metadata } from 'next'
import Link from 'next/link'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { AppFooter } from '@/components/layout/AppFooter'
import { ArrowLeft, MessageCircle, Mail, HelpCircle, Users, FileText, Shield } from 'lucide-react'
import { env } from '@/lib/env'

export const metadata: Metadata = {
  title: 'Support — Xkimm Xa Mali',
  description: 'Get help with the Xkimm Xa Mali platform.',
}

const faqs = [
  {
    q: 'How do I join the platform?',
    a: 'Xkimm Xa Mali is invite-only. You will receive a unique invitation code via SMS or email from an existing administrator. Use that code to complete your registration.',
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
          <Link href="/" className="flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold rounded-lg" aria-label="Xkimm Xa Mali home">
            <XmmLogo size={32} />
            <span className="font-bold text-white text-sm hidden sm:block">Xkimm Xa Mali</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 py-12 md:py-20 px-4">
        <div className="max-w-screen-md mx-auto space-y-10">
          {/* Header */}
          <div>
            <p className="text-xs font-bold text-xxm-gold tracking-widest uppercase mb-2">Help Centre</p>
            <h1 className="text-3xl sm:text-4xl font-black text-xxm-green-900 leading-tight">
              Support
            </h1>
            <p className="text-gray-600 text-[15px] leading-relaxed mt-3">
              Need help? Start with the FAQs below. For anything else, reach out to the
              platform administrators directly via WhatsApp.
            </p>
          </div>

          {/* Contact cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <a
              href={env.WHATSAPP_GROUP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="xxm-card p-5 flex items-start gap-4 hover:shadow-md transition-shadow group"
            >
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                <MessageCircle size={18} className="text-green-600" aria-hidden />
              </div>
              <div>
                <p className="font-bold text-xxm-green-900 group-hover:text-xxm-green transition-colors">
                  WhatsApp Group
                </p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                  Join the members&rsquo; WhatsApp group for direct admin contact and announcements.
                </p>
              </div>
            </a>

            <a
              href="mailto:support@xkimmxamali.co.za"
              className="xxm-card p-5 flex items-start gap-4 hover:shadow-md transition-shadow group"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Mail size={18} className="text-blue-500" aria-hidden />
              </div>
              <div>
                <p className="font-bold text-xxm-green-900 group-hover:text-xxm-green transition-colors">
                  Email Support
                </p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                  For non-urgent queries, email us. We respond within 1–2 business days.
                </p>
              </div>
            </a>
          </div>

          {/* FAQs */}
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black text-xxm-green-900 mb-5">
              <HelpCircle size={20} className="text-xxm-gold" aria-hidden />
              Frequently Asked Questions
            </h2>
            <div className="space-y-4">
              {faqs.map(({ q, a }) => (
                <div key={q} className="xxm-card p-5">
                  <p className="font-bold text-xxm-green-900 mb-2 text-sm">{q}</p>
                  <p className="text-sm text-gray-500 leading-relaxed">{a}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link href="/about" className="xxm-card p-4 flex items-center gap-3 hover:shadow-md transition-shadow group">
              <Users size={16} className="text-xxm-gold shrink-0" aria-hidden />
              <span className="text-sm font-medium text-gray-700 group-hover:text-xxm-green">About the platform</span>
            </Link>
            <Link href="/privacy" className="xxm-card p-4 flex items-center gap-3 hover:shadow-md transition-shadow group">
              <Shield size={16} className="text-xxm-gold shrink-0" aria-hidden />
              <span className="text-sm font-medium text-gray-700 group-hover:text-xxm-green">Privacy Policy</span>
            </Link>
            <Link href="/terms" className="xxm-card p-4 flex items-center gap-3 hover:shadow-md transition-shadow group">
              <FileText size={16} className="text-xxm-gold shrink-0" aria-hidden />
              <span className="text-sm font-medium text-gray-700 group-hover:text-xxm-green">Terms of Use</span>
            </Link>
          </div>
        </div>
      </main>

      <AppFooter />
    </div>
  )
}
