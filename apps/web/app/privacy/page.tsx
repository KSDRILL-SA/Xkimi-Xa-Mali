import type { Metadata } from 'next'
import Link from 'next/link'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { AppFooter } from '@/components/layout/AppFooter'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Privacy Policy — Xkimm Xa Mali',
  description: 'How Xkimm Xa Mali collects, uses, and protects your personal information.',
}

const sections = [
  {
    title: 'Information We Collect',
    body: `We collect personal information that you voluntarily provide when you register for membership, including your full name, email address, South African ID number, phone number, and bank account details required for DebiCheck mandate registration. We also collect usage data such as login activity, contribution history, and in-app actions for audit and compliance purposes.`,
  },
  {
    title: 'How We Use Your Information',
    body: `Your personal information is used exclusively to operate the Xkimm Xa Mali platform — specifically to process monthly contributions, send payment notifications, generate member statements, and maintain a complete financial audit trail. We do not sell, rent, or trade your personal information to any third party.`,
  },
  {
    title: 'Data Security',
    body: `All data transmitted to and from this platform is encrypted via TLS. Passwords are hashed using industry-standard bcrypt. Bank account details are stored encrypted and accessed only for the purpose of mandate management via our authorised payment processor. Access to production data is restricted to authorised administrators only and all admin actions are logged.`,
  },
  {
    title: 'Data Retention',
    body: `Member financial records, contribution histories, and audit logs are retained for a minimum of five years from the date of creation in accordance with applicable South African financial record-keeping requirements. Inactive member accounts are archived after 24 months of inactivity.`,
  },
  {
    title: 'Your Rights (POPIA)',
    body: `In accordance with the Protection of Personal Information Act (POPIA), you have the right to access the personal information we hold about you, request correction of inaccurate information, and request deletion of your data subject to our legal retention obligations. To exercise any of these rights, contact the platform administrator via the Support page.`,
  },
  {
    title: 'Cookies',
    body: `This platform uses session cookies strictly necessary for authentication and security. We do not use tracking or advertising cookies. You can disable cookies in your browser settings, but doing so will prevent you from logging in.`,
  },
  {
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

      <main className="flex-1 py-12 md:py-20 px-4">
        <div className="max-w-screen-md mx-auto">
          {/* Header */}
          <div className="mb-10">
            <p className="text-xs font-bold text-xxm-gold tracking-widest uppercase mb-2">Legal</p>
            <h1 className="text-3xl sm:text-4xl font-black text-xxm-green-900 leading-tight">
              Privacy Policy
            </h1>
            <p className="text-gray-500 text-sm mt-3">
              Effective date: 1 January 2025 &nbsp;·&nbsp; Last updated: {new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' })}
            </p>
            <p className="text-gray-600 text-[15px] leading-relaxed mt-4">
              Xkimm Xa Mali is a private, invite-only collective savings platform operated by KSDRILL-SA.
              This policy explains how we handle your personal information in accordance with the
              Protection of Personal Information Act (POPIA) and other applicable South African law.
            </p>
          </div>

          {/* Sections */}
          <div className="space-y-8">
            {sections.map(({ title, body }, i) => (
              <section key={title} className="xxm-card p-6">
                <h2 className="font-bold text-xxm-green-900 mb-3 flex items-start gap-3">
                  <span className="inline-flex w-6 h-6 rounded-full bg-xxm-gold/15 text-xxm-gold-dark text-xs font-black items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {title}
                </h2>
                <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
              </section>
            ))}
          </div>

          {/* Contact */}
          <div className="mt-10 rounded-2xl bg-xxm-green p-6 text-center">
            <p className="text-white text-sm leading-relaxed">
              Questions about this policy? Contact the platform administrator via the{' '}
              <Link href="/support" className="text-xxm-gold underline hover:text-xxm-gold-light">
                Support page
              </Link>
              .
            </p>
          </div>
        </div>
      </main>

      <AppFooter />
    </div>
  )
}
