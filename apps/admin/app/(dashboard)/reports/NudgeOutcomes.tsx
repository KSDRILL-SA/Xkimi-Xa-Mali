import { Reveal, ProgressBar } from '@xxm/ui'
import { MessageSquare, Info } from 'lucide-react'
import type { NudgeOutcome } from '@/lib/services'

const LABELS: Record<string, string> = {
  'contribution-due-reminder': 'Early-payment reminder',
  'debit-morning-warning':     'Debit-day warning',
}

/**
 * How often each reminder is followed by the thing it asks for.
 *
 * Presented as an outcome rate and labelled as one. Every eligible member gets
 * these messages, so there is no unexposed group to compare against — a member
 * who was always going to pay on time counts as reached. Saying "effectiveness"
 * here would be claiming something the data cannot support.
 */
export function NudgeOutcomes({ outcomes }: { outcomes: NudgeOutcome[] }) {
  const anySent = outcomes.some((o) => o.sent > 0)

  return (
    <Reveal variant="up" delay={350} className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-6">
      <div className="flex items-center gap-2 mb-1">
        <MessageSquare size={16} className="text-xxm-green" aria-hidden />
        <h3 className="font-display text-base font-bold text-xxm-green-900">Did the reminders land?</h3>
      </div>
      <p className="text-xs text-xxm-gray-400 mb-5">
        How often each message was followed by what it asked for, this month.
      </p>

      {!anySent ? (
        <p className="text-sm text-xxm-gray-400">No reminders were sent for this period.</p>
      ) : (
        <div className="space-y-4">
          {outcomes.map((o) => (
            <div key={o.slug}>
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-xxm-green-900">{LABELS[o.slug] ?? o.slug}</p>
                  <p className="text-[11px] text-xxm-gray-400">{o.intent}</p>
                </div>
                <p className="stat-number text-sm font-bold text-xxm-green-900 shrink-0 tabular-nums">
                  {o.rate === null ? '—' : `${o.rate}%`}
                  <span className="ml-1.5 text-[11px] font-medium text-xxm-gray-400">
                    {o.reached} of {o.sent}
                  </span>
                </p>
              </div>
              <ProgressBar
                value={o.rate ?? 0}
                max={100}
                size="sm"
                variant={o.rate === null ? 'default' : o.rate >= 80 ? 'success' : o.rate >= 50 ? 'gold' : 'danger'}
              />
            </div>
          ))}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-xxm-gray-400 mt-5 pt-4 border-t border-xxm-gray-100">
        <Info size={12} className="shrink-0 mt-0.5" aria-hidden />
        <span>
          Every member due gets these messages, so there is no un-messaged group to compare
          against. Read this as what happened after the reminder, not as what the reminder
          caused — someone who would have paid anyway counts here too.
        </span>
      </p>
    </Reveal>
  )
}
