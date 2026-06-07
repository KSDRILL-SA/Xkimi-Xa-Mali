import type { Metadata } from 'next'
import Link from 'next/link'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { AppFooter } from '@/components/layout/AppFooter'
import {
  ArrowLeft,
  Lock,
  ClipboardList,
  Activity,
  ShieldCheck,
  Archive,
  Scale,
  Cookie,
  RefreshCw,
  MessageCircle,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'Privacy Policy — Xkimm Xa Mali',
  description: 'How Xkimm Xa Mali collects, uses, and protects your personal information.',
}

const sections = [
  {
    icon: ClipboardList,
    title: 'Information We Collect',
    body: `We collect personal information that you voluntarily provide when you register for membership, including your full name, email address, South African ID number, phone number, and bank account details required for DebiCheck mandate registration. We also collect usage data such as login activity, contribution history, and in-app actions for audit and compliance purposes.`,
  },
  {
    icon: Activity,
    title: 'How We Use Your Information',
    body: `Your personal information is used exclusively to operate the Xkimm Xa Mali platform — specifically to process monthly contributions, send payment notifications, generate member statements, and maintain a complete financial audit trail. We do not sell, rent, or trade your personal information to any third party.`,
  },
  {
    icon: ShieldCheck,
    title: 'Data Security',
    body: `All data transmitted to and from this platform is encrypted via TLS. Passwords are hashed using industry-standard bcrypt. Bank account details are stored encrypted and accessed only for the purpose of mandate management via our authorised payment processor. Access to production data is restricted to authorised administrators only and all admin actions are logged.`,
  },
  {
    icon: Archive,
    title: 'Data Retention',
    body: `Member financial records, contribution histories, and audit logs are retained for a minimum of five years from the date of creation in accordance with applicable South African financial record-keeping requirements. Inactive member accounts are archived after 24 months of inactivity.`,
  },
  {
    icon: Scale,
    title: 'Your Rights (POPIA)',
    body: `In accordance with the Protection of Personal Information Act (POPIA), you have the right to access the personal information we hold about you, request correction of inaccurate information, and request deletion of your data subject to our legal retention obligations. To exercise any of these rights, contact the platform administrator via the Support page.`,
  },
  {
    icon: Cookie,
    title: 'Cookies',
    body: `This platform uses session cookies strictly necessary for authentication and security. We do not use tracking or advertising cookies. You can disable cookies in your browser settings, but doing so will prevent you from logging in.`,
  },
  {
    icon: RefreshCw,
    title: 'Changes to This Policy',
    body: `We may update this Privacy Policy from time to time. Material changes will be communicated to members via email notification at least 14 days before they take effect. Continued use of the platform after that date constitutes acceptance of the updated policy.`,
  },
]

export default function PrivacyPage() {
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
          <Link href="/" className="flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold rounded-lg" aria-label="Xkimm Xa Mali home">
            <XmmLogo size={32} />
            <span className="font-bold text-white text-sm hidden sm:block">Xkimm Xa Mali</span>
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
              <Lock size={24} className="text-xxm-gold" aria-hidden />
            </div>
            <p className="text-xs font-bold text-xxm-gold tracking-widest uppercase mb-2">Legal</p>
            <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">
              Privacy Policy
            </h1>
            <p className="text-white/50 text-sm mt-3">
              Effective date: 1 January 2025 &nbsp;·&nbsp; Last updated: {new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' })}
            </p>
            <p className="text-white/75 text-[15px] leading-relaxed mt-4 max-w-lg mx-auto">
              Xkimm Xa Mali is a private, invite-only collective savings platform operated by KSDRILL-SA.
              This policy explains how we handle your personal information in accordance with the
              Protection of Personal Information Act (POPIA) and other applicable South African law.
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
                  Questions about this policy? Contact the platform administrator via the{' '}
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
