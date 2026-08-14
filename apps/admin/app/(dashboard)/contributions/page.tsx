import type { Metadata } from 'next'
import { isPastPeriod } from '@xxm/utils/contribution-period'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import {
  listAllContributions, generateContributions, listTransactionsForContributions,
  previewGeneration, waiveContribution, recordPayment,
} from '@/lib/services'
import { formatZAR, MONTHS } from '@xxm/utils'
import { Alert, Reveal, RouterPagination } from '@xxm/ui'
import { Wallet, ChevronDown, Zap, Undo2, HandCoins, CircleSlash } from 'lucide-react'
import { requireAdmin } from '@/lib/admin-action'
import { internalAdminPost } from '@/lib/api'
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton'

export const metadata: Metadata = { title: 'Contributions' }

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  PENDING: { label: 'Pending', dot: 'bg-amber-500',  badge: 'bg-amber-100 text-amber-700' },
  PARTIAL: { label: 'Partial', dot: 'bg-sky-500',    badge: 'bg-sky-100 text-sky-700' },
  PAID:    { label: 'Paid',    dot: 'bg-xxm-green',  badge: 'bg-xxm-green-100 text-xxm-green-700' },
  OVERDUE: { label: 'Overdue', dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700' },
  WAIVED:  { label: 'Waived',  dot: 'bg-xxm-gray-400', badge: 'bg-xxm-gray-100 text-xxm-gray-600' },
}

const AVATAR_COLORS = [
  'bg-xxm-green text-white', 'bg-indigo-600 text-white', 'bg-purple-600 text-white',
  'bg-sky-600 text-white',   'bg-rose-600 text-white',   'bg-emerald-600 text-white',
]

function getAvatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

type RawItem = {
  id: string; periodMonth: number; periodYear: number
  amountDue: unknown; amountPaid: unknown; status: string
  user: { firstName: string; lastName: string; email: string }
}

type TxRow = {
  id: string; contributionId: string; amount: unknown
  type: string; status: string; gatewayRef: string | null
  reversalReason: string | null; createdAt: Date
  reversal: { id: string } | null
}

const TX_STATUS_BADGE: Record<string, string> = {
  PENDING:    'bg-amber-100 text-amber-700',
  PROCESSING: 'bg-sky-100 text-sky-700',
  SUCCESS:    'bg-xxm-green-100 text-xxm-green-700',
  FAILED:     'bg-red-100 text-red-700',
  REVERSED:   'bg-xxm-gray-100 text-xxm-gray-600',
}

export default async function ContributionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; status?: string; page?: string; generated?: string; created?: string; skipped?: string; total?: string; reversed?: string; reverseError?: string; waived?: string; recorded?: string; amount?: string; period?: string; actionError?: string }>
}) {
  const session = await auth()
  const roles   = (session?.user?.roles as string[] | undefined) ?? []
  if (!roles.includes('ADMIN')) redirect('/forbidden')

  const now    = new Date()
  const params = await searchParams

  const month     = Math.min(12, Math.max(1, parseInt(params.month ?? String(now.getMonth() + 1), 10)))
  const year      = Math.max(2024, parseInt(params.year ?? String(now.getFullYear()), 10))
  const status    = params.status ?? undefined
  const page      = Math.max(1, parseInt(params.page ?? '1', 10))
  const generated  = params.generated === '1'
  const genCreated = parseInt(params.created ?? '0', 10) || 0
  const genSkipped = parseInt(params.skipped ?? '0', 10) || 0
  const genTotal   = parseInt(params.total   ?? '0', 10) || 0

  const reversedOk  = params.reversed === '1'
  const reverseErr  = params.reverseError

  const { items, total } = await listAllContributions(roles, { month, year, status, page, limit: 25 })
  const contributions = items as unknown as RawItem[]

  // One query for the whole page rather than one per row.
  const txs = await listTransactionsForContributions(roles, contributions.map((c) => c.id))
  const txsByContribution = new Map<string, TxRow[]>()
  for (const t of txs as unknown as TxRow[]) {
    const list = txsByContribution.get(t.contributionId)
    if (list) list.push(t)
    else txsByContribution.set(t.contributionId, [t])
  }

  /**
   * Reverse a transaction.
   *
   * Through `requireAdmin` rather than a bare session read: it re-checks the
   * role version against the database, so an admin demoted since their token
   * was issued cannot move money with it. That check is the reason this action
   * does not call the service directly.
   *
   * The reversal itself lives in the member app, which owns the ledger, the
   * contribution recalculation and the member's notification. Calling across
   * rather than reimplementing keeps one copy of the money logic — three
   * separate copies of a status mapping is how the same defect shipped three
   * times in this repository.
   */
  async function reverse(fd: FormData) {
    'use server'
    const { userId, ip } = await requireAdmin('transaction.reverse')

    const transactionId = String(fd.get('transactionId') ?? '')
    const reason        = String(fd.get('reason') ?? '').trim()
    const m             = String(fd.get('month') ?? '')
    const y             = String(fd.get('year')  ?? '')
    const p             = String(fd.get('page')  ?? '1')
    const s             = String(fd.get('status') ?? '')

    const back = (extra: string) =>
      `/contributions?month=${m}&year=${y}${s ? `&status=${s}` : ''}&page=${p}${extra}`

    if (!transactionId) redirect(back('&reverseError=No+transaction+selected'))
    if (reason.length < 10) {
      redirect(back('&reverseError=A+reason+of+at+least+10+characters+is+required'))
    }

    const result = await internalAdminPost(
      `/api/v1/admin/transactions/${transactionId}/reverse`,
      { reason },
      { adminUserId: userId, adminIp: ip },
    )

    if (!result.ok) {
      redirect(back(`&reverseError=${encodeURIComponent(result.error?.message ?? 'The reversal could not be completed')}`))
    }

    redirect(back('&reversed=1'))
  }

  /**
   * Release a member from a month, and record money that arrived another way.
   *
   * Both are stated in the Founder Guide as things leadership can do, and until
   * now neither existed: `WAIVED` was a status every report could read and
   * nothing could write, and a cash payment had nowhere to go. The services
   * hold the rules; these two only carry the form across and put the refusal
   * back in the URL, the way `reverse` above does.
   */
  async function waive(fd: FormData) {
    'use server'
    const { userId, roles: r } = await requireAdmin('contribution.waive')

    const id     = String(fd.get('contributionId') ?? '')
    const reason = String(fd.get('reason') ?? '')
    const m = String(fd.get('month') ?? ''), y = String(fd.get('year') ?? '')
    const pg = String(fd.get('page') ?? '1'), st = String(fd.get('status') ?? '')
    const back = (extra: string) =>
      `/contributions?month=${m}&year=${y}${st ? `&status=${st}` : ''}&page=${pg}${extra}`

    try {
      const res = await waiveContribution(userId, r, id, reason)
      redirect(back(`&waived=1&period=${encodeURIComponent(res.period)}`))
    } catch (err) {
      if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
      redirect(back(`&actionError=${encodeURIComponent(err instanceof Error ? err.message : 'That did not go through')}`))
    }
  }

  async function record(fd: FormData) {
    'use server'
    const { userId, roles: r } = await requireAdmin('contribution.record-payment')

    const id     = String(fd.get('contributionId') ?? '')
    const amount = Number(fd.get('amount') ?? 0)
    const ref    = String(fd.get('reference') ?? '')
    const m = String(fd.get('month') ?? ''), y = String(fd.get('year') ?? '')
    const pg = String(fd.get('page') ?? '1'), st = String(fd.get('status') ?? '')
    const back = (extra: string) =>
      `/contributions?month=${m}&year=${y}${st ? `&status=${st}` : ''}&page=${pg}${extra}`

    try {
      const res = await recordPayment(userId, r, id, amount, ref)
      redirect(back(`&recorded=1&amount=${res.amount}&period=${encodeURIComponent(res.period)}`))
    } catch (err) {
      if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
      redirect(back(`&actionError=${encodeURIComponent(err instanceof Error ? err.message : 'That did not go through')}`))
    }
  }

  async function generate(fd: FormData) {
    'use server'
    const { userId, roles: r } = await requireAdmin('contributions.generate', { bulk: true })
    const m = parseInt(fd.get('month') as string, 10)
    const y = parseInt(fd.get('year')  as string, 10)

    const result = await generateContributions(userId, r, m, y)
    redirect(`/contributions?month=${m}&year=${y}&generated=1&created=${result.created}&skipped=${result.skipped}&total=${result.total}`)
  }

  const preview = await previewGeneration(roles, month, year)

  // Said before the press, not discovered after it. A period already behind us
  // is allowed — catching up on a missed month is a real thing leadership does
  // — but the obligations it writes are overdue the moment they exist, and that
  // is worth knowing while the button is still unpressed.
  const generateWarning = [
    preview.toCreate === 0
      ? `Every eligible member already has a contribution for ${MONTHS[month - 1]} ${year}. Nothing new would be created.`
      : `This creates ${preview.toCreate} contribution${preview.toCreate === 1 ? '' : 's'} of real money owed, one for each active member with an active debit order.`,
    preview.alreadyHave > 0 && preview.toCreate > 0
      ? `${preview.alreadyHave} member${preview.alreadyHave === 1 ? '' : 's'} already ha${preview.alreadyHave === 1 ? 's' : 've'} one and will be skipped.`
      : '',
    isPastPeriod({ month, year })
      ? 'This period has already passed, so every contribution created will be overdue immediately.'
      : '',
    'There is no undo.',
  ].filter(Boolean).join(' ')

  const yearOpts = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────── */}
      <Reveal variant="up" className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-xxm-green-900 tracking-tight">Contributions</h1>
          <p className="text-sm text-xxm-gray-500 mt-1">
            <span className="stat-number font-semibold text-xxm-green">{total}</span> records for {MONTHS[month - 1]} {year}
          </p>
        </div>
        {/* Confirmed, and it says how many people it touches.
            Reversing one transaction already asked the admin to confirm; this
            writes an obligation for every active member at once and asked
            nothing. The proportion was backwards. */}
        <form action={generate} className="flex items-center gap-2">
          <input type="hidden" name="month" value={month} />
          <input type="hidden" name="year"  value={year} />
          <ConfirmSubmitButton
            title={`Generate contributions for ${MONTHS[month - 1]} ${year}?`}
            message={generateWarning}
            confirmLabel={preview.toCreate > 0 ? `Generate ${preview.toCreate}` : 'Generate'}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-xxm-gold text-xxm-green-900 text-sm font-bold hover:bg-xxm-gold-light transition-colors shadow-gold-sm"
          >
            <Zap size={14} aria-hidden />
            Generate {MONTHS[month - 1]}
          </ConfirmSubmitButton>
        </form>
      </Reveal>

      {generated && (
        <Alert variant="success" title="Contributions generated">
          {genCreated > 0 ? (
            <>Created <strong>{genCreated}</strong> new contribution{genCreated === 1 ? '' : 's'} for {MONTHS[month - 1]} {year}.</>
          ) : (
            <>No new contributions needed for {MONTHS[month - 1]} {year} — every active mandate was already billed.</>
          )}
          {genSkipped > 0 && <> {genSkipped} already existed and {genSkipped === 1 ? 'was' : 'were'} skipped.</>}
          {genTotal > 0 && <> <span className="text-xxm-gray-500">({genTotal} active mandate{genTotal === 1 ? '' : 's'} in total.)</span></>}
        </Alert>
      )}

      {reversedOk && (
        <Alert variant="success" title="Transaction reversed">
          A reversing entry has been added and the member has been told. Nothing was deleted —
          the original payment and the correction both remain on the record.
        </Alert>
      )}

      {reverseErr && (
        <Alert variant="error" title="The reversal did not go through">
          {reverseErr}
        </Alert>
      )}

      {params.actionError && (
        <Alert variant="error" title="That did not go through">
          {params.actionError}
        </Alert>
      )}

      {params.waived === '1' && (
        <Alert variant="success" title="Month waived">
          {params.period ?? 'That month'} has been released, and the member has been told why.
          It shows on their statement as waived.
        </Alert>
      )}

      {params.recorded === '1' && (
        <Alert variant="success" title="Payment recorded">
          R{Number(params.amount ?? 0).toFixed(2)} recorded against {params.period ?? 'that month'}.
          The member has been told, and the payment is on their statement.
        </Alert>
      )}

      {/* ── Filters ─────────────────────────────────────────── */}
      <Reveal variant="up" delay={100} className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-4">
        <form method="GET" action="/contributions" className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <select
              name="month"
              defaultValue={month}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-xxm-gray-200 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25 cursor-pointer"
            >
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xxm-gray-400 pointer-events-none" aria-hidden />
          </div>
          <div className="relative">
            <select
              name="year"
              defaultValue={year}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-xxm-gray-200 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25 cursor-pointer"
            >
              {yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xxm-gray-400 pointer-events-none" aria-hidden />
          </div>
          <div className="relative">
            <select
              name="status"
              defaultValue={status ?? ''}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-xxm-gray-200 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25 cursor-pointer"
            >
              <option value="">All statuses</option>
              {Object.entries(STATUS_CONFIG).map(([v, { label }]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xxm-gray-400 pointer-events-none" aria-hidden />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-xxm-green text-white text-sm font-semibold hover:bg-xxm-canopy transition-colors"
          >
            Filter
          </button>
        </form>
      </Reveal>

      {/* ── Contributions list ──────────────────────────────── */}
      <Reveal variant="up" delay={200}>
      {contributions.length === 0 ? (
        <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-xxm-green-50 flex items-center justify-center mx-auto mb-4">
            <Wallet size={24} className="text-xxm-green-300" aria-hidden />
          </div>
          <p className="text-xxm-gray-600 font-medium">No contributions found</p>
          <p className="text-xxm-gray-400 text-sm mt-1">
            Try a different period or generate contributions for this month.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr_90px] gap-3 px-4 py-3 bg-xxm-gray-50 border-b border-xxm-gray-100">
            <span className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest">Member</span>
            <span className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest hidden sm:block">Period</span>
            <span className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest text-right">Due</span>
            <span className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest text-right">Paid</span>
            <span className="text-[11px] font-bold text-xxm-gray-400 uppercase tracking-widest text-center">Status</span>
          </div>
          <div className="divide-y divide-xxm-gray-50">
            {contributions.map((c) => {
              const fullName = `${c.user.firstName} ${c.user.lastName}`
              const initials = `${c.user.firstName[0] ?? ''}${c.user.lastName[0] ?? ''}`.toUpperCase()
              const sc = STATUS_CONFIG[c.status] ?? { label: c.status, dot: 'bg-gray-400', badge: 'bg-gray-100 text-gray-700' }
              const avatarColor = getAvatarColor(c.user.firstName)

              const rowTxs = txsByContribution.get(c.id) ?? []

              return (
                <details key={c.id} className="group/row">
                <summary
                  className="group grid grid-cols-[2fr_1fr_1fr_1fr_90px] gap-3 px-4 py-3 items-center hover:bg-xxm-green-50/40 transition-colors cursor-pointer list-none [&::-webkit-details-marker]:hidden"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-xl ${avatarColor} flex items-center justify-center text-[11px] font-bold shrink-0 transition-transform duration-slow group-hover:scale-110`}>
                      {initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-xxm-green-900 truncate">{fullName}</p>
                      <p className="text-[11px] text-xxm-gray-400 truncate">{c.user.email}</p>
                    </div>
                  </div>
                  <span className="text-xs text-xxm-gray-600 hidden sm:block">{MONTHS[c.periodMonth - 1]} {c.periodYear}</span>
                  <span className="stat-number text-sm font-semibold text-xxm-gray-700 text-right">{formatZAR(c.amountDue as number)}</span>
                  <span className="stat-number text-sm font-semibold text-xxm-green-700 text-right">{formatZAR(c.amountPaid as number)}</span>
                  <div className="flex justify-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${sc.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} aria-hidden />
                      {sc.label}
                    </span>
                  </div>
                </summary>

                {/* ── What leadership can still do about this month ───── */}
                <div className="px-4 pb-4 pt-1 bg-xxm-gray-50/60 border-t border-xxm-gray-100">
                  {c.status !== 'PAID' && c.status !== 'WAIVED' && (
                    <div className="grid gap-2 sm:grid-cols-2 pt-3">
                      {/* Money that arrived as cash or a transfer. The service
                          refuses more than is outstanding, so the hint is the
                          same number it checks against. */}
                      <form action={record} className="bg-white rounded-2xl border border-xxm-gray-100 p-3 space-y-2">
                        <input type="hidden" name="contributionId" value={c.id} />
                        <input type="hidden" name="month" value={month} />
                        <input type="hidden" name="year" value={year} />
                        <input type="hidden" name="page" value={page} />
                        <input type="hidden" name="status" value={status ?? ''} />
                        <p className="flex items-center gap-1.5 text-[11px] font-bold text-xxm-gray-500 uppercase tracking-wide">
                          <HandCoins size={12} aria-hidden /> Record a payment
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <input
                            name="amount" type="number" step="0.01" min="0.01"
                            max={Number(c.amountDue) - Number(c.amountPaid)}
                            required
                            placeholder={`Up to ${formatZAR(Number(c.amountDue) - Number(c.amountPaid))}`}
                            aria-label={`Amount received from ${fullName}`}
                            className="w-32 rounded-lg border border-xxm-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
                          />
                          <input
                            name="reference" required minLength={3}
                            placeholder="How it arrived"
                            aria-label={`How the payment from ${fullName} arrived`}
                            className="flex-1 min-w-[8rem] rounded-lg border border-xxm-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
                          />
                        </div>
                        <ConfirmSubmitButton
                          title="Record this payment?"
                          message={`This adds money to ${fullName}'s ${MONTHS[c.periodMonth - 1]} ${c.periodYear} contribution and tells them it arrived. Only do this once the money is actually in the account.`}
                          confirmLabel="Record it"
                          className="px-3 py-1.5 rounded-lg bg-xxm-green text-white text-xs font-semibold hover:bg-xxm-canopy transition-colors"
                        >
                          Record payment
                        </ConfirmSubmitButton>
                      </form>

                      {/* Releasing the month. Deliberately beside recording a
                          payment: they are the two ways a month stops being
                          owed, and an admin should see both at once. */}
                      <form action={waive} className="bg-white rounded-2xl border border-xxm-gray-100 p-3 space-y-2">
                        <input type="hidden" name="contributionId" value={c.id} />
                        <input type="hidden" name="month" value={month} />
                        <input type="hidden" name="year" value={year} />
                        <input type="hidden" name="page" value={page} />
                        <input type="hidden" name="status" value={status ?? ''} />
                        <p className="flex items-center gap-1.5 text-[11px] font-bold text-xxm-gray-500 uppercase tracking-wide">
                          <CircleSlash size={12} aria-hidden /> Waive this month
                        </p>
                        <input
                          name="reason" required minLength={10}
                          placeholder="Why this month is being released"
                          aria-label={`Why ${fullName}'s month is being waived`}
                          className="w-full rounded-lg border border-xxm-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
                        />
                        <ConfirmSubmitButton
                          title="Waive this month?"
                          message={`${fullName} will owe nothing for ${MONTHS[c.periodMonth - 1]} ${c.periodYear}. They are told the reason, it is recorded against your name, and it shows on their statement as waived.`}
                          confirmLabel="Waive it"
                          className="px-3 py-1.5 rounded-lg border border-xxm-gray-200 text-xxm-gray-700 text-xs font-semibold hover:bg-xxm-gray-50 transition-colors"
                        >
                          Waive month
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  )}

                  {rowTxs.length === 0 ? (
                    <p className="text-xs text-xxm-gray-400 py-2">No payments recorded against this contribution yet.</p>
                  ) : (
                    <ul className="space-y-2 pt-2">
                      {rowTxs.map((t) => {
                        // Only a settled payment can be reversed, and only once.
                        // The service enforces both; offering an action that is
                        // certain to be refused is worse than not offering it.
                        const canReverse = t.status === 'SUCCESS' && !t.reversal

                        return (
                          <li key={t.id} className="bg-white rounded-2xl border border-xxm-gray-100 p-3">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${TX_STATUS_BADGE[t.status] ?? 'bg-gray-100 text-gray-700'}`}>
                                {t.status}
                              </span>
                              <span className="text-[11px] font-semibold text-xxm-gray-500">{t.type}</span>
                              <span className="stat-number text-sm font-bold text-xxm-green-900">{formatZAR(t.amount as number)}</span>
                              <span className="font-mono text-[10px] text-xxm-gray-400 truncate">{t.gatewayRef ?? '—'}</span>
                              <span className="text-[11px] text-xxm-gray-400 ml-auto">
                                {new Date(t.createdAt).toLocaleDateString('en-ZA')}
                              </span>
                            </div>

                            {t.reversalReason && (
                              <p className="mt-2 text-[11px] text-xxm-gray-500">
                                <span className="font-semibold text-xxm-gray-600">Reason for reversal: </span>
                                {t.reversalReason}
                              </p>
                            )}

                            {t.status === 'SUCCESS' && t.reversal && (
                              <p className="mt-2 text-[11px] text-xxm-gray-400">
                                Already corrected by a reversing entry.
                              </p>
                            )}

                            {canReverse && (
                              <form action={reverse} className="mt-3 flex flex-col sm:flex-row sm:items-end gap-2">
                                <input type="hidden" name="transactionId" value={t.id} />
                                <input type="hidden" name="month"  value={month} />
                                <input type="hidden" name="year"   value={year} />
                                <input type="hidden" name="page"   value={page} />
                                <input type="hidden" name="status" value={status ?? ''} />

                                <label className="flex-1 min-w-0">
                                  <span className="block text-[10px] font-bold text-xxm-gray-400 uppercase tracking-widest mb-1">
                                    Reason for reversal (required)
                                  </span>
                                  <input
                                    type="text"
                                    name="reason"
                                    required
                                    minLength={10}
                                    maxLength={500}
                                    placeholder="Why is this payment being corrected?"
                                    className="w-full px-3 py-2 rounded-xl border border-xxm-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
                                  />
                                </label>

                                <ConfirmSubmitButton
                                  title="Reverse this transaction?"
                                  message={`This adds a visible reversing entry for ${formatZAR(t.amount as number)}. The original payment is not deleted, the member is told, and the action is permanently logged against your name.`}
                                  confirmLabel="Reverse it"
                                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors shrink-0"
                                >
                                  <Undo2 size={14} aria-hidden />
                                  Reverse
                                </ConfirmSubmitButton>
                              </form>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
                </details>
              )
            })}
          </div>
        </div>
      )}
      </Reveal>

      {/* ── Pagination ──────────────────────────────────────── */}
      {total > 25 && (
        <RouterPagination
          totalItems={total}
          itemsPerPage={25}
          currentPage={page}
          baseUrl={`/contributions?month=${month}&year=${year}${status ? `&status=${status}` : ''}`}
          className="justify-center"
        />
      )}

    </div>
  )
}
