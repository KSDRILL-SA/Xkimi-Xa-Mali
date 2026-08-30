import { Landmark, Info } from 'lucide-react'
import { GROUP_ACCOUNT, NETCASH_FEE_BUFFER } from '@/lib/group-account'
import { formatZAR } from '@/lib/formatters'

/**
 * Transparency card showing the group's settlement account (where Netcash
 * deposits collected contributions) and the indicative Netcash processing fee.
 */
export function GroupCollectionAccount({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-xxm-green/10 bg-xxm-green-50/40 overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-xxm-green/10">
        <div className="w-7 h-7 rounded-lg bg-xxm-green/10 flex items-center justify-center shrink-0">
          <Landmark size={14} className="text-xxm-green" aria-hidden />
        </div>
        <div>
          <p className="text-[11px] font-bold text-xxm-green-700 uppercase tracking-wide">Group collection account</p>
          <p className="text-[10px] text-xxm-gray-500">Where your contributions are settled</p>
        </div>
      </div>

      {/* min-w-0 on every cell, same reason as SummaryCards.tsx: a
          2-up grid on a narrow phone gives each cell ~150px, and
          "Xkimi Xa Mali Foundation" plus a letter-spaced mono account
          number are both wide enough to force the grid track past that —
          stretching the whole card off-screen instead of wrapping. */}
      <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'} gap-x-4 gap-y-3 px-4 py-3.5`}>
        <div className="min-w-0">
          <p className="text-[10px] text-xxm-gray-400 uppercase tracking-wide">Account name</p>
          <p className="text-sm font-bold text-xxm-green-900 break-words">{GROUP_ACCOUNT.accountName}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-xxm-gray-400 uppercase tracking-wide">Bank</p>
          <p className="text-sm font-bold text-xxm-green-900 break-words">{GROUP_ACCOUNT.bankName}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-xxm-gray-400 uppercase tracking-wide">Account number</p>
          <p className="text-sm font-bold text-xxm-green-900 font-mono tracking-wider break-all">{GROUP_ACCOUNT.accountNumber}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-xxm-gray-400 uppercase tracking-wide">Branch code</p>
          <p className="text-sm font-bold text-xxm-green-900 font-mono tracking-wider break-all">{GROUP_ACCOUNT.branchCode}</p>
        </div>
      </div>

      {NETCASH_FEE_BUFFER > 0 && (
        <div className="flex items-start gap-2 px-4 py-2.5 bg-amber-50/70 border-t border-amber-100">
          <Info size={13} className="text-amber-600 shrink-0 mt-0.5" aria-hidden />
          <p className="text-[11px] text-amber-800 leading-relaxed">
            Netcash deducts a processing fee per debit. Budget about{' '}
            <span className="font-bold">{formatZAR(NETCASH_FEE_BUFFER)}</span> on top of your contribution so the group
            receives the full amount.
          </p>
        </div>
      )}
    </div>
  )
}
