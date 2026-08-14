import type { Metadata } from 'next'
import Link from 'next/link'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { AppFooter } from '@/components/layout/AppFooter'
import {
  ArrowLeft,
  Scale,
  Users,
  Wallet,
  CheckCircle2,
  Landmark,
  Lock,
  AlertTriangle,
  Gavel,
  FileEdit,
  MessageCircle,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: 'Terms and conditions governing your use of the Xkimm Xa Mali Foundation platform.',
}

const sections = [
  {
    icon: Users,
    title: 'Membership & Access',
    body: `Xkimm Xa Mali Foundation is a private, invite-only platform. Access is granted exclusively by an existing administrator via a unique invitation code. By accepting an invitation and completing registration, you agree to these terms in full. Membership may be revoked at any time for breach of these terms or the rules of the collective.`,
  },
  {
    icon: Wallet,
    title: 'Contribution Obligations',
    body: `Each member agrees to pay the agreed monthly contribution amount on or before the due date each month. By registering a DebiCheck debit mandate, you authorise Xkimm Xa Mali Foundation's payment processor (Netcash) to collect the stipulated amount from your registered bank account. Repeated non-payment or failed debit attempts may result in suspension or removal from the platform.`,
  },
  {
    icon: CheckCircle2,
    title: 'Acceptable Use',
    body: `You agree to use this platform solely for its intended purpose of tracking and managing collective contributions. You may not attempt to access data belonging to other members, reverse-engineer any part of the platform, or use the platform to conduct any activity that is unlawful under South African law. Any misuse will result in immediate suspension and may be reported to the relevant authorities.`,
  },
  {
    icon: Landmark,
    title: 'Financial Responsibility',
    body: `Xkimm Xa Mali Foundation is not a registered bank, financial services provider, or investment scheme. The platform is a private member management tool. All funds collected remain the collective property of the contributing members and are governed by the internal rules of the collective, not by any external regulatory body. Members are collectively responsible for the governance and distribution of pooled funds.`,
  },
  {
    icon: Lock,
    title: 'Account Security',
    body: `You are responsible for maintaining the confidentiality of your login credentials. You agree to notify the administrator immediately if you suspect unauthorised access to your account. Xkimm Xa Mali Foundation will never ask for your password via email, SMS, or phone call. Actions taken under your account are deemed to be authorised by you unless you have reported a breach.`,
  },
  {
    icon: AlertTriangle,
    title: 'Limitation of Liability',
    body: `KSDRILL-SA and the administrators of Xkimm Xa Mali Foundation shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform. The platform is provided "as is" and we make no warranty that it will be error-free or uninterrupted. Our total liability for any claim is limited to the value of contributions processed in the three months preceding the claim.`,
  },
  {
    icon: Gavel,
    title: 'Governing Law',
    body: `These terms are governed by the laws of the Republic of South Africa. Any disputes arising from these terms or your use of the platform shall be subject to the exclusive jurisdiction of the South African courts.`,
  },
  {
    icon: FileEdit,
    title: 'Amendments',
    body: `We reserve the right to amend these terms at any time. Members will be notified of material changes at least 14 days in advance via email. Continued use of the platform after the effective date of amended terms constitutes acceptance.`,
  },
]

export default function TermsPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-xxm-champagne">
      {/* Nav */}
      <header className="sticky top-0 z-40 bg-xxm-green border-b border-white/10 shadow-xxm">
        <div className="h-16 flex items-center gap-4 px-4 md:px-8 max-w-screen-xl mx-auto">
          <Link
            href="/about"
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold rounded"
            aria-label="Back to About"
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
              <Scale size={24} className="text-xxm-gold" aria-hidden />
            </div>
            <p className="text-xs font-bold text-xxm-gold tracking-widest uppercase mb-2">Legal</p>
            <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">
              Terms of Use
            </h1>
            <p className="text-white/50 text-sm mt-3">
              Effective date: 1 January 2025 &nbsp;·&nbsp; Last updated: {new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' })}
            </p>
            <p className="text-white/75 text-[15px] leading-relaxed mt-4 max-w-lg mx-auto">
              By accessing or using the Xkimm Xa Mali Foundation platform operated by KSDRILL-SA, you agree to
              be bound by these Terms of Use. Please read them carefully before proceeding.
            </p>
          </div>
        </section>

        <div className="py-12 md:py-16 px-4">
          <div className="max-w-screen-md mx-auto">
            {/* Quick-jump nav */}
            <nav aria-label="Jump to section" className="flex gap-2 overflow-x-auto pb-2 mb-8 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {sections.map(({ title }, i) => (
                <a
                  key={title}
                  href={`#section-${i + 1}`}
                  className="shrink-0 px-3.5 py-1.5 rounded-full bg-white border border-xxm-green/10 text-xs font-semibold text-xxm-green-700 hover:border-xxm-gold/40 hover:text-xxm-green-900 hover:shadow-xxm-sm transition-all whitespace-nowrap"
                >
                  {title}
                </a>
              ))}
            </nav>

            {/* Sections */}
            <div className="space-y-5">
              {sections.map(({ icon: Icon, title, body }, i) => (
                <section
                  key={title}
                  id={`section-${i + 1}`}
                  className="scroll-mt-24 bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-6 hover:border-xxm-gold/20 hover:shadow-xxm transition-all"
                >
                  <h2 className="font-bold text-xxm-green-900 mb-3 flex items-center gap-3">
                    <span className="inline-flex w-10 h-10 rounded-xl bg-xxm-green-50 items-center justify-center shrink-0">
                      <Icon size={18} className="text-xxm-green" aria-hidden />
                    </span>
                    <span className="flex items-baseline gap-2">
                      <span className="text-xxm-gold-dark text-xs font-black tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                      {title}
                    </span>
                  </h2>
                  <p className="text-sm text-xxm-gray-600 leading-relaxed">{body}</p>
                </section>
              ))}
            </div>

            {/* Contact CTA */}
            <div className="mt-10 relative overflow-hidden rounded-2xl bg-xxm-green p-8 text-center">
              <div
                className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl opacity-20 pointer-events-none"
                style={{ background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)' }}
                aria-hidden
              />
              <div className="relative">
                <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-xxm-gold/15 mb-4">
                  <MessageCircle size={20} className="text-xxm-gold" aria-hidden />
                </div>
                <p className="text-white text-sm leading-relaxed max-w-sm mx-auto">
                  Questions about these terms? Reach out via the{' '}
                  <Link href="/support" className="text-xxm-gold underline hover:text-xxm-gold-light font-semibold">
                    Support page
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <AppFooter />
    </div>
  )
}
