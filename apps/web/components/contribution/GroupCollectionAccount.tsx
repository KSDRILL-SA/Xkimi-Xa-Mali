import { Landmark, Info } from 'lucide-react'
import { GROUP_ACCOUNT, NETCASH_FEE_BUFFER } from '@/lib/group-account'
import { formatZAR } from '@/lib/formatters'

/**
 * Where the group's contributions are settled, shown for transparency.
 *
 * Styled to the system's card language — `rounded-3xl`, a hairline border, a
 * tinted header strip and the gradient icon tile with its ring — as one card
 * rather than nested tinted blocks.
 *
 * It sits at the foot of the contributions page: reference material, below a
 * member's own record rather than interrupting it.
 *
 * (An earlier note here blamed translucent backgrounds for the tearing on that
 * page. That was wrong, along with six other guesses — the cause was a
 * transform animation on the app shell's `<main>`. See `ContributionHero`.)
 */
export function GroupCollectionAccount({ compact = false }: { compact?: boolean } = {}) {
  const fields = [
    { label: 'Account name', value: GROUP_ACCOUNT.accountName, mono: false },
    { label: 'Bank', value: GROUP_ACCOUNT.bankName, mono: false },
    { label: 'Account number', value: GROUP_ACCOUNT.accountNumber, mono: true },
    { label: 'Branch code', value: GROUP_ACCOUNT.branchCode, mono: true },
  ]

  return (
    <section
      aria-label="Group collection account"
      className={`overflow-hidden rounded-3xl border border-xxm-green/8 bg-white ${
        compact ? '' : 'shadow-xxm-sm sm:shadow-xxm'
      }`}
    >
      <div className="flex items-center gap-2.5 border-b border-xxm-gray-100 bg-xxm-gray-50 px-4 py-3 sm:px-5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-xxm-green/15 to-xxm-green/5 ring-1 ring-xxm-green/10"
          aria-hidden
        >
          <Landmark size={14} className="text-xxm-green" />
        </span>
        <div className="min-w-0">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-xxm-green-700">
            Group collection account
          </h2>
          <p className="text-[10px] text-xxm-gray-500">Where your contributions are settled</p>
        </div>
      </div>

      {/* `min-w-0` on each cell: a 2-up grid on a narrow phone gives each about
          150px, and both the account name and a letter-spaced account number
          are wide enough to force their track past that — stretching the card
          off-screen rather than wrapping inside it.

          `compact` keeps two columns at every width; it renders inside the
          payment modal, which is far narrower than the page. */}
      <dl
        className={`grid gap-x-4 gap-y-3.5 px-4 py-4 sm:px-5 ${
          compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'
        }`}
      >
        {fields.map(({ label, value, mono }) => (
          <div key={label} className="min-w-0">
            <dt className="text-[10px] uppercase tracking-widest text-xxm-gray-400">{label}</dt>
            <dd
              className={`mt-0.5 text-sm font-bold text-xxm-green-900 ${
                mono ? 'stat-number break-all font-mono tracking-wider' : 'break-words'
              }`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {NETCASH_FEE_BUFFER > 0 && (
        <p className="flex items-start gap-2 border-t border-amber-100 bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-800 sm:px-5">
          <Info size={13} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
          <span>
            Netcash deducts a processing fee per debit. Budget about{' '}
            <strong className="font-bold">{formatZAR(NETCASH_FEE_BUFFER)}</strong> on top of your
            contribution so the group receives the full amount.
          </span>
        </p>
      )}
    </section>
  )
}
