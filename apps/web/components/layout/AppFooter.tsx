import type { Route } from 'next'
import Link from 'next/link'
import { Shield, FileText, HelpCircle, Info, MessageCircle } from 'lucide-react'
import { XmmLogo } from '@/components/ui/XmmLogo'
import { env } from '@/lib/env'

const legal = [
  { icon: Info,       label: 'About',          href: '/about' },
  { icon: Shield,     label: 'Privacy Policy', href: '/privacy' },
  { icon: FileText,   label: 'Terms of Use',   href: '/terms' },
  { icon: HelpCircle, label: 'Support',        href: '/support' },
]

interface AppFooterProps {
  whatsappGroupLink?: string
  whatsappGroupName?: string
}

// Every call site renders <AppFooter /> with no props, so these defaults are
// what members actually see. They used to be a literal invite link and name,
// which meant the group link in the footer could only be changed by editing and
// redeploying — and quietly went stale the moment the group was recreated.
export function AppFooter({
  whatsappGroupLink = env.WHATSAPP_GROUP_LINK,
  whatsappGroupName = env.WHATSAPP_GROUP_NAME,
}: AppFooterProps = {}) {
  const year = new Date().getFullYear()

  return (
    <footer className="mt-auto border-t border-gray-100 bg-white">
      <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-8">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6">

          {/* Brand */}
          <div className="flex flex-col gap-3 max-w-xs">
            <XmmLogo size={38} withText textColor="text-xxm-green" />
            <p className="text-xs text-gray-400 leading-relaxed">
              A private, invite-only collective savings platform built on financial discipline,
              brotherhood, and a shared commitment to building lasting wealth.
            </p>
            <p className="text-[11px] text-xxm-gold-dark italic font-medium">
              &ldquo;Blessed is the hand that giveth.&rdquo; — Acts 20:35
            </p>
          </div>

          {/* Community */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Community
            </p>
            <a
              href={whatsappGroupLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 text-xs text-gray-500 hover:text-xxm-green transition-colors group"
            >
              <span className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-400 group-hover:text-xxm-green group-hover:border-xxm-green/30 group-hover:bg-xxm-green-50 transition-all duration-150">
                <MessageCircle size={15} aria-hidden />
              </span>
              {whatsappGroupName}
            </a>
          </div>

          {/* Legal links */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Platform
            </p>
            <ul className="flex flex-col gap-2">
              {legal.map(({ icon: Icon, label, href }) => (
                <li key={label}>
                  <Link
                    href={href as Route}
                    className="flex items-center gap-2 text-xs text-gray-500 hover:text-xxm-green transition-colors outline-none focus-visible:underline"
                  >
                    <Icon size={12} aria-hidden />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom strip */}
        <div className="mt-8 pt-5 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 text-center sm:text-left">
            <p className="text-xs text-gray-400">
              &copy; {year} Xkimm Xa Mali Foundation. Private members&rsquo; platform.
            </p>
            <span className="hidden sm:inline text-gray-300 mx-1.5">·</span>
            <p className="text-xs text-gray-400">
              By <span className="font-semibold text-xxm-green/60">KSDRILL-SA</span> product.
            </p>
          </div>
          <div className="flex items-center gap-1 flex-wrap justify-center">
            <span className="inline-flex items-center gap-1 text-[10px] text-xxm-green/40 font-medium uppercase tracking-wider">
              <Shield size={10} aria-hidden />
              Financial Discipline
            </span>
            <span className="text-gray-200 mx-1.5">·</span>
            <span className="text-[10px] text-xxm-green/40 font-medium uppercase tracking-wider">
              Stronger Together
            </span>
            <span className="text-gray-200 mx-1.5">·</span>
            <span className="text-[10px] text-xxm-green/40 font-medium uppercase tracking-wider">
              Securing Futures
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
