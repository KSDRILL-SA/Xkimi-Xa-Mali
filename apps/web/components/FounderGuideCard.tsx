import { Gem, Download, BookOpen } from 'lucide-react'

/**
 * The Founder Guide, offered to the people it is issued to.
 *
 * Rendered only where the caller has already established that this member holds
 * the founder distinction. That check is a convenience, not the control — the
 * download route re-checks the badge on every request, because a card that is
 * not rendered is not a permission.
 *
 * Deliberately styled apart from the statement rows beside it. A statement is
 * one member's month; this is the document the Foundation is run by, and it
 * should not look like another row in a list.
 */
export function FounderGuideCard() {
  return (
    <div className="relative overflow-hidden rounded-3xl border border-xxm-gold/30 bg-gradient-to-br from-xxm-green-900 to-xxm-green-800 shadow-xxm">
      {/* The gold rule that opens every page of the document itself. */}
      <div className="h-1 bg-gradient-to-r from-xxm-gold/40 via-xxm-gold to-xxm-gold/40" />

      <div className="p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-xxm-gold/15 ring-1 ring-xxm-gold/30 flex items-center justify-center shrink-0">
            <BookOpen size={22} className="text-xxm-gold" aria-hidden />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-lg font-extrabold text-white tracking-tight">
                The Founder Guide
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-xxm-gold/40 bg-xxm-gold/10 px-2 py-0.5 text-[10px] font-bold text-xxm-gold">
                <Gem size={10} aria-hidden />
                Founders only
              </span>
            </div>

            <p className="text-sm text-xxm-green-100/80 mt-2 leading-relaxed max-w-xl">
              Everything the Foundation asks of its members, everything it owes them, and how
              the money moves between the two. Every figure in it is read from the system that
              enforces it, so the copy you download is current at the moment you download it.
            </p>

            <a
              href="/api/v1/guide"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-xxm-gold px-4 py-2.5 text-sm font-bold text-xxm-green-900 transition-transform duration-slow hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xxm-gold"
            >
              <Download size={15} aria-hidden />
              Download the guide
            </a>

            <p className="text-[11px] text-xxm-green-100/50 mt-3">
              Generated fresh each time · A4 PDF · Prepared in your name
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
