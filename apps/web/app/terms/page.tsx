import type { Metadata } from 'next'
import Link from 'next/link'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { AppFooter } from '@/components/layout/AppFooter'
import { ArrowLeft } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Terms of Use — Xkimm Xa Mali',
  description: 'Terms and conditions governing your use of the Xkimm Xa Mali platform.',
}

const sections = [
  {
    title: 'Membership & Access',
    body: `Xkimm Xa Mali is a private, invite-only platform. Access is granted exclusively by an existing administrator via a unique invitation code. By accepting an invitation and completing registration, you agree to these terms in full. Membership may be revoked at any time for breach of these terms or the rules of the collective.`,
  },
  {
    title: 'Contribution Obligations',
    body: `Each member agrees to pay the agreed monthly contribution amount on or before the due date each month. By registering a DebiCheck debit mandate, you authorise Xkimm Xa Mali's payment processor (Netcash) to collect the stipulated amount from your registered bank account. Repeated non-payment or failed debit attempts may result in suspension or removal from the platform.`,
  },
  {
    title: 'Acceptable Use',
    body: `You agree to use this platform solely for its intended purpose of tracking and managing collective contributions. You may not attempt to access data belonging to other members, reverse-engineer any part of the platform, or use the platform to conduct any activity that is unlawful under South African law. Any misuse will result in immediate suspension and may be reported to the relevant authorities.`,
  },
  {
    title: 'Financial Responsibility',
    body: `Xkimm Xa Mali is not a registered bank, financial services provider, or investment scheme. The platform is a private member management tool. All funds collected remain the collective property of the contributing members and are governed by the internal rules of the collective, not by any external regulatory body. Members are collectively responsible for the governance and distribution of pooled funds.`,
  },
  {
    title: 'Account Security',
    body: `You are responsible for maintaining the confidentiality of your login credentials. You agree to notify the administrator immediately if you suspect unauthorised access to your account. Xkimm Xa Mali will never ask for your password via email, SMS, or phone call. Actions taken under your account are deemed to be authorised by you unless you have reported a breach.`,
  },
  {
    title: 'Limitation of Liability',
    body: `KSDRILL-SA and the administrators of Xkimm Xa Mali shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform. The platform is provided "as is" and we make no warranty that it will be error-free or uninterrupted. Our total liability for any claim is limited to the value of contributions processed in the three months preceding the claim.`,
  },
  {
    title: 'Governing Law',
    body: `These terms are governed by the laws of the Republic of South Africa. Any disputes arising from these terms or your use of the platform shall be subject to the exclusive jurisdiction of the South African courts.`,
  },
  {
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
              Terms of Use
            </h1>
            <p className="text-xxm-gray-500 text-sm mt-3">
              Effective date: 1 January 2025 &nbsp;·&nbsp; Last updated: {new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' })}
            </p>
            <p className="text-xxm-gray-600 text-[15px] leading-relaxed mt-4">
              By accessing or using the Xkimm Xa Mali platform operated by KSDRILL-SA, you agree to
              be bound by these Terms of Use. Please read them carefully before proceeding.
            </p>
          </div>

          {/* Sections */}
          <div className="space-y-8">
            {sections.map(({ title, body }, i) => (
              <section key={title} className="bg-white rounded-2xl border border-xxm-green/8 shadow-xxm-sm p-6">
                <h2 className="font-bold text-xxm-green-900 mb-3 flex items-start gap-3">
                  <span className="inline-flex w-6 h-6 rounded-full bg-xxm-gold/15 text-xxm-gold-dark text-xs font-black items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {title}
                </h2>
                <p className="text-sm text-xxm-gray-600 leading-relaxed">{body}</p>
              </section>
            ))}
          </div>

          {/* Contact */}
          <div className="mt-10 rounded-2xl bg-xxm-green p-6 text-center">
            <p className="text-white text-sm leading-relaxed">
              Questions about these terms? Contact us via the{' '}
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
