import { CheckCircle2, Camera, Paperclip } from 'lucide-react'
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton'

type Props = {
  status: string
  outcomeNote: string | null
  outcomeProofUrl: string | null
  outcomeRecordedAt: Date | null
  recordedBy: string | null
  action: (formData: FormData) => Promise<void>
}

/**
 * Step 6 of the Goal flow, in the console: document what the money bought.
 *
 * Only rendered for an ACHIEVED goal. Offering it earlier would invite a
 * description of a purchase that has not happened.
 */

/**
 * Where to point the "view the proof" link.
 *
 * Proofs are stored privately now, so the stored value is a blob pathname
 * rather than a URL a browser can follow — it goes through `/api/media`, which
 * checks for an admin session and refuses any reference no row claims.
 *
 * Local development has no blob store and keeps the bytes in a `data:` URL,
 * which the browser renders on its own. Those are used as-is: sending one
 * through the route would be asking the server to fetch something the page is
 * already holding.
 *
 * A legacy absolute URL is also passed straight through, so a proof recorded
 * before this change still opens.
 */
function proofHref(ref: string): string {
  if (ref.startsWith('data:') || /^https?:\/\//.test(ref)) return ref
  return `/api/media?ref=${encodeURIComponent(ref)}`
}

export function GoalOutcomePanel({
  status, outcomeNote, outcomeProofUrl, outcomeRecordedAt, recordedBy, action,
}: Props) {
  if (status !== 'ACHIEVED') return null

  // Already documented — show it rather than offering to overwrite it. Quietly
  // replacing what the circle was shown is the thing the guide rules out.
  if (outcomeRecordedAt) {
    return (
      <section className="bg-white rounded-3xl border border-xxm-green/10 shadow-xxm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-xxm-green-50 flex items-center justify-center shrink-0">
            <CheckCircle2 size={18} className="text-xxm-green" aria-hidden />
          </div>
          <div>
            <h2 className="text-sm font-bold text-xxm-green-900">Outcome documented</h2>
            <p className="text-[11px] text-xxm-gray-400 mt-0.5">
              Recorded {outcomeRecordedAt.toLocaleDateString('en-ZA')}
              {recordedBy && ` by ${recordedBy}`} — the circle has been told
            </p>
          </div>
        </div>

        <p className="text-sm text-xxm-gray-700 leading-relaxed whitespace-pre-wrap">{outcomeNote}</p>

        {outcomeProofUrl && (
          <a
            href={proofHref(outcomeProofUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-xxm-green hover:underline"
          >
            <Paperclip size={14} aria-hidden />
            View the attached proof
          </a>
        )}
      </section>
    )
  }

  return (
    <section className="bg-white rounded-3xl border border-xxm-gold/25 shadow-xxm p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-2xl bg-xxm-gold/15 flex items-center justify-center shrink-0">
          <Camera size={18} className="text-xxm-gold-dark" aria-hidden />
        </div>
        <div>
          <h2 className="text-sm font-bold text-xxm-green-900">Show the circle what this bought</h2>
          <p className="text-[11px] text-xxm-gray-400 mt-0.5">
            The closing act of the Goal — everyone sees what their money actually did
          </p>
        </div>
      </div>

      <form action={action} className="space-y-4">
        <label className="block">
          <span className="block text-xs font-semibold text-xxm-gray-700 mb-1.5">
            What did the money do? *
          </span>
          <textarea
            name="outcomeNote"
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            placeholder="e.g. Bought a commercial gas stove and two prep tables for the catering business. Collected on 14 March."
            className="w-full rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
          />
        </label>

        <label className="block">
          <span className="block text-xs font-semibold text-xxm-gray-700 mb-1.5">
            Photo or receipt <span className="font-normal text-xxm-gray-400">(optional)</span>
          </span>
          <input
            type="file"
            name="proof"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="w-full text-sm text-xxm-gray-600 file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-xxm-green-50 file:text-xxm-green file:text-xs file:font-semibold hover:file:bg-xxm-green-100"
          />
          <span className="block text-[11px] text-xxm-gray-400 mt-1.5">
            PNG, JPEG, WebP or PDF, up to 8 MB. Not required — a written account should never
            wait on a receipt that cannot be found.
          </span>
        </label>

        <div className="flex justify-end">
          <ConfirmSubmitButton
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-xxm-green text-white text-sm font-bold hover:bg-xxm-canopy transition-colors"
            title="Document this outcome?"
            message="Every active member will be told what this Goal bought. An outcome is recorded once and is not overwritten afterwards, so check it reads the way you want the circle to read it."
            confirmLabel="Show the circle"
          >
            <CheckCircle2 size={14} aria-hidden />
            Document the outcome
          </ConfirmSubmitButton>
        </div>
      </form>
    </section>
  )
}
