import type { Metadata } from 'next'
import Link from 'next/link'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { AppFooter } from '@/components/layout/AppFooter'
import {
  ArrowLeft,
  BookOpen,
  Building2,
  FolderOpen,
  Unlock,
  FileText,
  Ban,
  Gavel,
  MessageCircle,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'PAIA Manual',
  description:
    'Manual published in terms of section 51 of the Promotion of Access to Information Act, 2 of 2000.',
}

/**
 * The section 51 manual, published.
 *
 * PAIA requires **every** private body — a fifty-person savings collective
 * included — to compile a manual describing the records it holds and how a
 * person may request access to them, and to make it available on its website.
 * Exemptions for small bodies have been granted and allowed to lapse more than
 * once, and the safe position is to have one.
 *
 * The full drafted manual lives at `docs/compliance/paia-manual.md`. This page is
 * the published form of it. Where that document carries bracketed placeholders
 * for details that are not yet settled, this page routes to the Support page
 * instead of showing an unfilled blank — a published manual with `[NAME]` in it
 * is worse than the honest instruction to write in.
 */
const sections = [
  {
    icon: Building2,
    title: 'About This Manual',
    body: `This manual is published in terms of section 51 of the Promotion of Access to Information Act, 2 of 2000 ("PAIA"). It describes the records held by Xkimm Xa Mali Foundation and explains how a person may request access to them. The Foundation is a private, invite-only savings collective. Requests and enquiries under this manual should be directed to the Information Officer via the Support page.`,
  },
  {
    icon: BookOpen,
    title: 'The Section 10 Guide',
    body: `The Information Regulator has compiled a guide, in terms of section 10 of PAIA, explaining how to use the Act. It is available from the Information Regulator (South Africa), JD House, 27 Stiemens Street, Braamfontein, Johannesburg, 2001, by email at inforeg@inforegulator.org.za, or from inforegulator.org.za.`,
  },
  {
    icon: FolderOpen,
    title: 'Records We Hold',
    body: `The Foundation holds records in the following categories. Governance: the constitution, minutes and resolutions of meetings, and the register of office bearers. Membership: the register of members, invitations to join, records of member status and resignation, and consents given. Financial: records of every contribution, records of payments made from the pool and the Goal each served, the general ledger, bank records, debit order mandates, and annual financial statements. Operational: the audit log of administrative actions, records of communications sent to members, and system access records. Listing a category here does not mean those records are automatically available — access is decided on request.`,
  },
  {
    icon: Unlock,
    title: 'Records Available Without a Request',
    body: `A member does not need to invoke PAIA to see their own record. A member's contribution history, their personal information, and the status and progress of every Goal are available in the member portal at any time, and a member's own record can be downloaded. The constitution is available to any member on request, and annual financial statements are presented to members at the annual general meeting. The Foundation's position is that a member's record belongs to that member.`,
  },
  {
    icon: FileText,
    title: 'How to Request Access',
    body: `A request must be made on the prescribed form published by the Information Regulator and delivered to the Information Officer. It must contain enough detail to identify the record and the requester, an address for reply, and the form of access required. Where the request is made to exercise or protect a right, it must state what that right is and how the record would assist. A requester seeking their own personal information does not pay a request fee; other requests attract the request and access fees prescribed by regulation. The Information Officer will decide within 30 days and respond in writing. Where an extension is needed, the requester will be told before the 30 days expire.`,
  },
  {
    icon: Ban,
    title: 'Grounds for Refusal',
    body: `Access may or must be refused on the grounds set out in Chapter 4 of PAIA. Because almost every record the Foundation holds concerns identifiable members, the most likely ground is the protection of the personal information of a third party, where disclosure would be unreasonable. Other grounds include commercial information of a third party, information supplied in confidence, information whose disclosure could endanger a person's life or safety, and records protected by legal professional privilege. Where a request is refused, reasons will be given.`,
  },
  {
    icon: Gavel,
    title: 'Remedies',
    body: `A requester who is dissatisfied with a decision may lodge a complaint with the Information Regulator, or apply to a court with jurisdiction. There is no internal appeal against a decision of a private body under PAIA.`,
  },
]

export default function PaiaPage() {
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
          <Link
            href="/"
            className="flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-xxm-gold rounded-lg"
            aria-label="Xkimm Xa Mali Foundation home"
          >
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
              <BookOpen size={24} className="text-xxm-gold" aria-hidden />
            </div>
            <p className="text-xs font-bold text-xxm-gold tracking-widest uppercase mb-2">Legal</p>
            <h1 className="text-3xl sm:text-4xl font-black text-white leading-tight">PAIA Manual</h1>
            <p className="text-white/50 text-sm mt-3">
              Section 51, Promotion of Access to Information Act, 2 of 2000
              &nbsp;·&nbsp; Last updated:{' '}
              {new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long' })}
            </p>
            <p className="text-white/75 text-[15px] leading-relaxed mt-4 max-w-lg mx-auto">
              Every private body in South Africa must publish a manual describing the records it
              holds and how a person may ask to see them. This is ours.
            </p>
          </div>
        </section>

        <div className="py-12 md:py-16 px-4">
          <div className="max-w-screen-md mx-auto">
            {/* Quick-jump nav */}
            <nav
              aria-label="Jump to section"
              className="flex gap-2 overflow-x-auto pb-2 mb-8 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
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
                      <span className="text-xxm-gold-dark text-xs font-black tabular-nums">
                        {String(i + 1).padStart(2, '0')}
                      </span>
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
                  To make a request, or to reach the Information Officer, use the{' '}
                  <Link
                    href="/support"
                    className="text-xxm-gold underline hover:text-xxm-gold-light font-semibold"
                  >
                    Support page
                  </Link>
                  . See also our{' '}
                  <Link
                    href="/privacy"
                    className="text-xxm-gold underline hover:text-xxm-gold-light font-semibold"
                  >
                    Privacy Policy
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
