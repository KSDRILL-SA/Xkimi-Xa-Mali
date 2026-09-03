import type { Metadata } from 'next'
import { isPastPeriod } from '@xxm/utils/contribution-period'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import {
  listAllContributions, generateContributions, listTransactionsForContributions,
  previewGeneration, waiveContribution, recordPayment,
  recordOfflinePaymentForMember, listPayableMembers,
  recordOfflineGoalPaymentForMember, listFundableGoals,
} from '@/lib/services'
import { formatZAR, MONTHS } from '@xxm/utils'
import { Alert, Reveal, RouterPagination } from '@xxm/ui'
import { Wallet, ChevronDown, Zap, Undo2, HandCoins, CircleSlash, Banknote, TriangleAlert, FileText } from 'lucide-react'
import { requireAdmin } from '@/lib/admin-action'
import { internalAdminPost } from '@/lib/api'
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton'
import { storePaymentProof, PaymentProofError, PROOF_ACCEPT, PROOF_FORMATS } from '@/lib/payment-proof-storage'

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
  offlineReference: string | null; processedAt: Date | null
  proofUrl: string | null; proofWitness: string | null
  reversal: { id: string } | null
}

const TX_STATUS_BADGE: Record<string, string> = {
  PENDING:    'bg-amber-100 text-amber-700',
  PROCESSING: 'bg-sky-100 text-sky-700',
  SUCCESS:    'bg-xxm-green-100 text-xxm-green-700',
  FAILED:     'bg-red-100 text-red-700',
  REVERSED:   'bg-xxm-gray-100 text-xxm-gray-600',
}

/**
 * What a successful recording puts back in the URL.
 *
 * `outstanding` and `over` are carried because the amount is no longer capped
 * at what was owed. The old form refused anything larger, which is the wrong
 * answer for a member with no debit order — nobody knows what they owe, and
 * turning away a deposit already sitting in the bank account does not
 * un-receive the money, it just leaves it unrecorded. So it is accepted, and
 * the banner says plainly that more went on than was owed while the admin is
 * still looking at the screen and can reverse it.
 *
 * Module scope rather than inside the component: both server actions call it,
 * and a server action closing over a function would ask Next to serialise
 * something it cannot.
 */
/**
 * Turn what the form submitted into the one piece of evidence the payment rests
 * on: a stored document, or a note naming who counted the cash.
 *
 * Both forms on this page go through here, because "what counts as evidence" is
 * exactly the rule that must not be stated twice. The file is read and stored
 * on this side rather than forwarded — the console owns the upload adapter, and
 * streaming a member's bank document through a second app to be stored there
 * would put it in one more place for no gain.
 *
 * Returns a message instead of throwing: every refusal here is a person filling
 * in a form incorrectly, and the caller puts it back on their screen.
 */
async function resolveEvidence(
  fd: FormData,
): Promise<{ evidence: { proofUrl?: string; proofWitness?: string } } | { error: string }> {
  const isCash = fd.get('noProof') === 'on'
  const witness = String(fd.get('proofWitness') ?? '').trim()
  const file = fd.get('proof')
  const hasFile = file instanceof File && file.size > 0

  if (isCash) {
    // Refused rather than quietly preferring one. An admin who ticked the box
    // and also attached something has contradicted themselves, and guessing
    // which they meant would record a claim neither of them made.
    if (hasFile) {
      return { error: 'You attached a file and also said there is no proof of payment. Do one or the other.' }
    }
    if (witness.length < 10) {
      return { error: 'Say who counted the cash and where — one name is not a witness.' }
    }
    return { evidence: { proofWitness: witness } }
  }

  if (!hasFile) {
    return { error: `Attach the proof of payment (${PROOF_FORMATS}), or tick "cash — no proof of payment".` }
  }

  try {
    const stored = await storePaymentProof({
      buffer: Buffer.from(await file.arrayBuffer()),
      contentType: file.type,
      filename: file.name,
    })
    return { evidence: { proofUrl: stored.pathname } }
  } catch (err) {
    // The storage layer's message names the actual problem — wrong format, too
    // large, empty file — and is written for this reader.
    if (err instanceof PaymentProofError) return { error: err.message }
    throw err
  }
}

function recordedParams(res: {
  amount: number; period: string; outstanding: number; overpaid: boolean; memberName: string
}) {
  return (
    `&recorded=1&amount=${res.amount}&period=${encodeURIComponent(res.period)}` +
    `&outstanding=${res.outstanding}${res.overpaid ? '&over=1' : ''}` +
    `&who=${encodeURIComponent(res.memberName)}`
  )
}

export default async function ContributionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string; status?: string; page?: string; generated?: string; created?: string; skipped?: string; total?: string; reversed?: string; reverseError?: string; waived?: string; recorded?: string; amount?: string; period?: string; actionError?: string; outstanding?: string; over?: string; who?: string; goalPaid?: string; goal?: string; goalNow?: string; goalTarget?: string; goalHit?: string }>
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
    const { userId, roles: r, ip } = await requireAdmin('contribution.waive')

    const id     = String(fd.get('contributionId') ?? '')
    const reason = String(fd.get('reason') ?? '')
    const m = String(fd.get('month') ?? ''), y = String(fd.get('year') ?? '')
    const pg = String(fd.get('page') ?? '1'), st = String(fd.get('status') ?? '')
    const back = (extra: string) =>
      `/contributions?month=${m}&year=${y}${st ? `&status=${st}` : ''}&page=${pg}${extra}`

    try {
      const res = await waiveContribution(userId, r, id, reason, ip)
      redirect(back(`&waived=1&period=${encodeURIComponent(res.period)}`))
    } catch (err) {
      if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
      redirect(back(`&actionError=${encodeURIComponent(err instanceof Error ? err.message : 'That did not go through')}`))
    }
  }

  async function record(fd: FormData) {
    'use server'
    const { userId, roles: r, ip } = await requireAdmin('contribution.record-payment')

    const id     = String(fd.get('contributionId') ?? '')
    const amount = Number(fd.get('amount') ?? 0)
    const ref    = String(fd.get('reference') ?? '')
    const dateIn = String(fd.get('receivedAt') ?? '')
    const m = String(fd.get('month') ?? ''), y = String(fd.get('year') ?? '')
    const pg = String(fd.get('page') ?? '1'), st = String(fd.get('status') ?? '')
    const back = (extra: string) =>
      `/contributions?month=${m}&year=${y}${st ? `&status=${st}` : ''}&page=${pg}${extra}`

    // A blank date means "today" rather than an error. The field is optional on
    // this form because the common case here is a payment being recorded as it
    // arrives; the catch-up form below, where the date is months in the past,
    // requires it.
    const receivedAt = dateIn ? new Date(`${dateIn}T12:00:00`) : new Date()
    if (Number.isNaN(receivedAt.getTime())) {
      redirect(back('&actionError=That+is+not+a+date'))
    }

    const resolved = await resolveEvidence(fd)
    if ('error' in resolved) redirect(back(`&actionError=${encodeURIComponent(resolved.error)}`))

    try {
      const res = await recordPayment(userId, r, id, amount, ref, ip, receivedAt, resolved.evidence)
      redirect(back(recordedParams(res)))
    } catch (err) {
      if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
      redirect(back(`&actionError=${encodeURIComponent(err instanceof Error ? err.message : 'That did not go through')}`))
    }
  }

  /**
   * Record a payment for a member and a month that has no contribution row.
   *
   * The backlog case, and the reason this page needed a second form. The row
   * form above can only act on a month that already exists, and
   * `generateMonthlyContributions` only raises a period for members with an
   * active debit order — so June, July and August for the four members who have
   * been paying by EFT are not on this page to be clicked. This form makes the
   * period and the payment in one go.
   *
   * It redirects to the period that was paid rather than back to the one being
   * viewed: the whole point of entering August from the June screen is to then
   * see it, and landing back on a screen that does not show what you just did
   * reads as a failure.
   */
  async function recordOffline(fd: FormData) {
    'use server'
    const { userId, roles: r, ip } = await requireAdmin('contribution.record-payment')

    const memberId = String(fd.get('userId') ?? '')
    // What the money is FOR. Everything downstream depends on it: which table
    // the row lands in, and — the reason it has to be explicit — what counts as
    // "already recorded". A duplicate is scoped to the thing being paid for, so
    // a payment with no stated purpose cannot be checked against anything.
    const target   = String(fd.get('target') ?? 'contribution')
    const amount   = Number(fd.get('amount') ?? 0)
    const dueRaw   = String(fd.get('amountDue') ?? '').trim()
    const pm       = parseInt(String(fd.get('periodMonth') ?? ''), 10)
    const py       = parseInt(String(fd.get('periodYear') ?? ''), 10)
    const ref      = String(fd.get('reference') ?? '')
    const note     = String(fd.get('note') ?? '').trim()
    const dateIn   = String(fd.get('receivedAt') ?? '')

    // Land on the month that was paid, not the one being viewed.
    const back = (extra: string) => `/contributions?month=${pm}&year=${py}${extra}`
    const stay = (extra: string) =>
      `/contributions?month=${String(fd.get('month') ?? '')}&year=${String(fd.get('year') ?? '')}${extra}`

    if (!memberId) redirect(stay('&actionError=Choose+a+member'))
    if (!Number.isFinite(pm) || !Number.isFinite(py)) {
      redirect(stay('&actionError=Choose+the+month+the+payment+was+for'))
    }

    // Midday rather than midnight. A date-only input has no timezone, and
    // parsing it as UTC midnight lands on the previous day for anybody east of
    // Greenwich — which is everybody using this.
    const receivedAt = dateIn ? new Date(`${dateIn}T12:00:00`) : new Date()
    if (Number.isNaN(receivedAt.getTime())) redirect(stay('&actionError=That+is+not+a+date'))

    // Before the money is written, not after. A payment recorded and then found
    // to have an unreadable attachment would need reversing, and the file is
    // the cheap thing to check first.
    const resolved = await resolveEvidence(fd)
    if ('error' in resolved) redirect(stay(`&actionError=${encodeURIComponent(resolved.error)}`))

    // ── Money for a goal ────────────────────────────────────────────────
    //
    // A different table, a different duplicate rule, and no period at all — a
    // goal is not owed monthly. The period fields the form still shows are
    // ignored here rather than quietly recorded against something.
    if (target.startsWith('goal:')) {
      const goalId = target.slice('goal:'.length)
      if (!goalId) redirect(stay('&actionError=Choose+which+goal+this+payment+is+for'))

      try {
        const g = await recordOfflineGoalPaymentForMember({
          adminId: userId, adminRoles: r,
          userId: memberId,
          goalId,
          amount,
          reference: ref,
          receivedAt,
          ...(note ? { note } : {}),
          ...resolved.evidence,
          ip,
        })
        redirect(stay(
          `&goalPaid=1&amount=${g.amount}&who=${encodeURIComponent(g.memberName)}` +
          `&goal=${encodeURIComponent(g.goalTitle)}&goalNow=${g.currentAmount}` +
          `&goalTarget=${g.targetAmount}${g.achieved ? '&goalHit=1' : ''}`,
        ))
      } catch (err) {
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
        redirect(stay(`&actionError=${encodeURIComponent(err instanceof Error ? err.message : 'That did not go through')}`))
      }
    }

    try {
      const res = await recordOfflinePaymentForMember({
        adminId: userId, adminRoles: r,
        userId: memberId,
        amount,
        periodMonth: pm,
        periodYear: py,
        reference: ref,
        receivedAt,
        // Omitted rather than zero when left blank: the service treats an
        // absent figure as "nothing to go on" and falls back, and a zero would
        // be a stated obligation of nothing.
        ...(dueRaw ? { amountDue: Number(dueRaw) } : {}),
        ...(note ? { note } : {}),
        ...resolved.evidence,
        ip,
      })
      redirect(back(recordedParams(res)))
    } catch (err) {
      if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) throw err
      redirect(stay(`&actionError=${encodeURIComponent(err instanceof Error ? err.message : 'That did not go through')}`))
    }
  }

  async function generate(fd: FormData) {
    'use server'
    const { userId, roles: r, ip } = await requireAdmin('contributions.generate', { bulk: true })
    const m = parseInt(fd.get('month') as string, 10)
    const y = parseInt(fd.get('year')  as string, 10)

    const result = await generateContributions(userId, r, m, y, ip)
    redirect(`/contributions?month=${m}&year=${y}&generated=1&created=${result.created}&skipped=${result.skipped}&total=${result.total}`)
  }

  const [preview, payableMembers, fundableGoals] = await Promise.all([
    previewGeneration(roles, month, year),
    listPayableMembers(roles),
    listFundableGoals(roles),
  ])

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

  // For the date fields' ceiling. Local parts, not toISOString(): that converts
  // to UTC first, which in SAST hands back yesterday's date before 02:00.
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const inputCls =
    'w-full rounded-xl border border-xxm-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-xxm-green/25'
  const labelCls =
    'block text-[10px] font-bold text-xxm-gray-400 uppercase tracking-widest mb-1'
  // The native control, restyled. A file input cannot be replaced without
  // JavaScript, and this page is deliberately server-rendered forms — so the
  // button half is styled through ::file-selector-button and left working.
  const fileCls =
    'w-full rounded-xl border border-dashed border-xxm-gray-300 px-3 py-2 text-sm bg-white ' +
    'file:mr-3 file:rounded-lg file:border-0 file:bg-xxm-green-50 file:px-3 file:py-1.5 ' +
    'file:text-xs file:font-semibold file:text-xxm-green-800 hover:file:bg-xxm-green-100 ' +
    'file:cursor-pointer focus:outline-none focus:ring-2 focus:ring-xxm-green/25'

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
        params.over === '1' ? (
          // Recorded, but worth stopping on. More money went onto the month
          // than was owed, which is either a member paying ahead or somebody
          // typing the wrong figure — and only a person can tell which.
          <Alert variant="warning" title="Payment recorded — more than was owed">
            R{Number(params.amount ?? 0).toFixed(2)} recorded against {params.period ?? 'that month'}
            {params.who ? ` for ${params.who}` : ''}. That is
            R{Math.abs(Number(params.outstanding ?? 0)).toFixed(2)} more than was outstanding, so the
            month now shows a credit. If that was not intended, reverse the payment on the row below —
            nothing is deleted, the correction shows alongside it.
          </Alert>
        ) : (
          <Alert variant="success" title="Payment recorded">
            R{Number(params.amount ?? 0).toFixed(2)} recorded against {params.period ?? 'that month'}
            {params.who ? ` for ${params.who}` : ''}.{' '}
            {Number(params.outstanding ?? 0) > 0
              ? `R${Number(params.outstanding).toFixed(2)} is still outstanding on that month.`
              : 'That month is now settled in full.'}
            {' '}The member has been told, and the payment is on their statement.
          </Alert>
        )
      )}

      {params.goalPaid === '1' && (
        <Alert
          variant="success"
          title={params.goalHit === '1' ? 'Payment recorded — goal reached' : 'Payment recorded toward a goal'}
        >
          R{Number(params.amount ?? 0).toFixed(2)} recorded toward{' '}
          <strong>{params.goal ?? 'that goal'}</strong>
          {params.who ? ` for ${params.who}` : ''}, now at R
          {Number(params.goalNow ?? 0).toFixed(2)} of R{Number(params.goalTarget ?? 0).toFixed(2)}.
          {params.goalHit === '1'
            ? ' That target has been reached, and every member has been told.'
            : ''}{' '}
          The member has been told, and it counts toward their standing.
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


      {/* ── Money that arrived outside the debit order ───────── */}
      {/*
          Why this is a second form rather than a wider version of the one on
          each row: the row form can only act on a month that is already on this
          page, and the months that most need recording are not. Contributions
          are only generated for members with an active debit order, and Netcash
          declined the DebiCheck application — so for the members who have been
          paying by EFT since June, no row exists to click. This one makes the
          month and the payment together.
      */}
      <Reveal variant="up" delay={150}>
        {/* Stays open when the last attempt was refused. Otherwise the panel
            collapses on the redirect and the error banner above it is left
            explaining a form nobody can see — which reads as the page having
            simply lost the payment. */}
        <details
          open={Boolean(params.actionError)}
          className="group bg-white rounded-3xl border border-xxm-green/8 shadow-xxm overflow-hidden"
        >
          <summary className="flex items-center gap-3 px-5 py-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-xxm-green-50/40 transition-colors">
            <span className="w-9 h-9 rounded-2xl bg-xxm-gold/15 flex items-center justify-center shrink-0">
              <Banknote size={16} className="text-xxm-gold-dark" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-xxm-green-900">Record a cash or EFT payment</span>
              <span className="block text-xs text-xxm-gray-500 mt-0.5">
                For money already in the bank account — toward a month, or toward a goal.
              </span>
            </span>
            <ChevronDown
              size={16}
              className="ml-auto text-xxm-gray-400 shrink-0 transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>

          <form action={recordOffline} className="px-5 pb-5 pt-1 border-t border-xxm-gray-100 space-y-4">
            {/* Where to go back to if this is refused, so a rejected form does
                not also silently change which month is on screen. */}
            <input type="hidden" name="month" value={month} />
            <input type="hidden" name="year"  value={year} />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-4">
              <label className="sm:col-span-2">
                <span className={labelCls}>Member</span>
                <div className="relative">
                  <select name="userId" required defaultValue="" className={`${inputCls} appearance-none pr-8 cursor-pointer`}>
                    <option value="" disabled>Choose a member…</option>
                    {payableMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {m.monthlyAmount !== null ? ` — ${formatZAR(m.monthlyAmount)}/month` : ' — no debit order'}
                        {m.status !== 'ACTIVE' ? ` (${m.status.toLowerCase()})` : ''}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-xxm-gray-400 pointer-events-none" aria-hidden />
                </div>
                <span className="block text-[11px] text-xxm-gray-400 mt-1">
                  Invited members who have not signed up yet are listed too — their payments still count.
                </span>
              </label>

              <label className="sm:col-span-2">
                <span className={labelCls}>What is this payment for?</span>
                <div className="relative">
                  {/*
                      The field the whole form hangs off. It decides which table
                      the row lands in and — the reason it cannot be left vague
                      — what "already recorded" is measured against: a duplicate
                      is scoped to the thing being paid for, so a payment with
                      no stated purpose cannot be checked against anything.

                      The monthly fund is not in the goal list on purpose. It
                      fills from monthly contributions, so money for it IS a
                      contribution — recording it as a goal payment would raise
                      the fund total while leaving the member's month unpaid,
                      and the debit run would keep trying to collect money
                      already in the account. The service refuses it too; this
                      just keeps the mistake off the screen.
                  */}
                  <select name="target" defaultValue="contribution" className={`${inputCls} appearance-none pr-8 cursor-pointer`}>
                    <option value="contribution">Monthly contribution — the fund</option>
                    {fundableGoals.length > 0 && (
                      <optgroup label="Goals">
                        {fundableGoals.map((g) => (
                          <option key={g.id} value={`goal:${g.id}`}>
                            {g.title} — {formatZAR(g.current)} of {formatZAR(g.target)}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-xxm-gray-400 pointer-events-none" aria-hidden />
                </div>
                <span className="block text-[11px] text-xxm-gray-400 mt-1">
                  {fundableGoals.length > 0
                    ? 'The month below applies to a monthly contribution; a goal payment is not owed monthly and ignores it.'
                    : 'No active goals to pay toward right now, so this is a monthly contribution.'}
                </span>
              </label>

              <label>
                <span className={labelCls}>Month paid for</span>
                <div className="relative">
                  <select name="periodMonth" defaultValue={month} className={`${inputCls} appearance-none pr-8 cursor-pointer`}>
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-xxm-gray-400 pointer-events-none" aria-hidden />
                </div>
              </label>

              <label>
                <span className={labelCls}>Year</span>
                <div className="relative">
                  <select name="periodYear" defaultValue={year} className={`${inputCls} appearance-none pr-8 cursor-pointer`}>
                    {yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-xxm-gray-400 pointer-events-none" aria-hidden />
                </div>
              </label>

              <label className="sm:col-span-2">
                <span className={labelCls}>Amount received</span>
                <input
                  name="amount" type="number" step="0.01" min="0.01" required
                  placeholder="0.00"
                  className={`${inputCls} stat-number`}
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

              {/*
                  The field that stops a part payment reading as settled.

                  A member with an active debit order already has an agreed
                  amount and this is ignored for them. A member without one has
                  no recorded obligation anywhere, so left blank the month is
                  created owing exactly what arrived — and R200 against a R500
                  month marks them up to date. That is the whole reason this
                  asks.
              */}
              <label>
                <span className={labelCls}>Owed for that month <span className="font-semibold text-xxm-gray-300">(optional)</span></span>
                <input
                  name="amountDue" type="number" step="0.01" min="0.01"
                  placeholder="If they owed more"
                  className={`${inputCls} stat-number`}
                />
                <span className="block text-[11px] text-xxm-gray-400 mt-1">
                  Monthly contributions only — a goal is not owed by the month.
                </span>
              </label>

              <label>
                <span className={labelCls}>Date the money arrived</span>
                <input
                  name="receivedAt" type="date" required max={todayISO}
                  defaultValue={todayISO}
                  className={inputCls}
                />
              </label>

              <label>
                <span className={labelCls}>Bank reference</span>
                <input
                  name="reference" required minLength={3} maxLength={120}
                  placeholder="e.g. EFT 8231, or cash at the June meeting"
                  className={inputCls}
                />
              </label>
            </div>

            <label className="block">
              <span className={labelCls}>Note <span className="font-semibold text-xxm-gray-300">(optional)</span></span>
              <input
                name="note" maxLength={500}
                placeholder="Anything else worth remembering about this payment"
                className={inputCls}
              />
            </label>

            {/* ── What the payment rests on ─────────────────────────────
                Required, because an offline row is otherwise one person's
                claim that money arrived and nothing lets anybody else check
                it. Members already send these to the WhatsApp group; this is
                where the file goes.

                The cash escape is not a loophole, it is the honest case:
                money handed over at a meeting has no proof of payment, and a
                hard requirement would mean either the cash goes unrecorded —
                the exact failure this page exists to prevent — or somebody
                attaches something irrelevant to get past the gate. Naming who
                counted it makes the absence itself a record.
            */}
            <fieldset className="rounded-2xl border border-xxm-gray-200 bg-xxm-gray-50/60 p-4 space-y-3">
              <legend className="px-1.5 text-[10px] font-bold text-xxm-gray-500 uppercase tracking-widest">
                Proof of payment
              </legend>

              <label className="block">
                <span className="sr-only">Proof of payment file</span>
                <input type="file" name="proof" accept={PROOF_ACCEPT} className={fileCls} />
                <span className="block text-[11px] text-xxm-gray-400 mt-1.5">
                  {PROOF_FORMATS}, up to 4&nbsp;MB — the bank&apos;s proof of payment, a screenshot, or a photo of the deposit slip.
                </span>
              </label>

              <div className="border-t border-xxm-gray-200 pt-3 space-y-2">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox" name="noProof"
                    className="mt-0.5 w-4 h-4 rounded border-xxm-gray-300 text-xxm-green focus:ring-2 focus:ring-xxm-green/25 cursor-pointer shrink-0"
                  />
                  <span className="text-xs text-xxm-gray-600 leading-relaxed">
                    <span className="font-semibold text-xxm-gray-700">Cash — there is no proof of payment.</span>{' '}
                    Tick this only for money handed over in person, then say who counted it.
                  </span>
                </label>
                <input
                  name="proofWitness" maxLength={300}
                  placeholder="e.g. Counted by Kurhula and Thandi at the August meeting"
                  aria-label="Who counted the cash"
                  className={inputCls}
                />
              </div>
            </fieldset>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
              <ConfirmSubmitButton
                title="Record this payment?"
                message="This writes money onto the member's record against the month or goal you chose, stores the proof of payment with it, and tells them it arrived. Only do this once you have seen it on the bank statement or taken the cash. It can be reversed afterwards, but not deleted."
                confirmLabel="Record it"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-xxm-green text-white text-sm font-bold hover:bg-xxm-canopy transition-colors shrink-0"
              >
                <HandCoins size={14} aria-hidden />
                Record payment
              </ConfirmSubmitButton>
              {/*
                  Said before the press. More than is owed is accepted rather
                  than refused — nobody knows what a member with no debit order
                  owes, and turning away a deposit that is already in the account
                  does not un-receive it — so the guard is that the admin is told
                  it happened, here and again in the banner afterwards.
              */}
              <p className="flex items-start gap-2 text-[11px] text-xxm-gray-500 leading-relaxed">
                <TriangleAlert size={13} className="text-amber-500 shrink-0 mt-px" aria-hidden />
                <span>
                  Recording more than is owed is allowed — you will be told when it happens.
                  The same reference cannot be recorded twice for the same member and month.
                </span>
              </p>
            </div>
          </form>
        </details>
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
          {/* The "Period" cell hides below sm, but the grid's own column
              track for it does not — reserved space sat empty while the
              other four columns kept shrinking to fit a phone screen. Same
              fix as the other tables here: scroll sideways instead. This
              also carries each row's expanded panel (payment history, waive
              / record-payment forms) along at the same width, which is a
              fair trade against clipping the numbers in the row itself. */}
          <div className="overflow-x-auto">
          <div className="min-w-[720px]">
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
                      {/* Money that arrived as cash or a transfer. The amount
                          is no longer capped at what is outstanding: the cap
                          used to be enforced by the service, and refusing a
                          deposit larger than the figure on file did not
                          un-receive the money — it left it unrecorded. So the
                          outstanding balance is a hint, and going over is
                          reported in the banner instead of blocked here. */}
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
                            required
                            placeholder={`${formatZAR(Number(c.amountDue) - Number(c.amountPaid))} outstanding`}
                            aria-label={`Amount received from ${fullName}`}
                            className="w-36 rounded-lg border border-xxm-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
                          />
                          <input
                            name="reference" required minLength={3} maxLength={120}
                            placeholder="How it arrived"
                            aria-label={`How the payment from ${fullName} arrived`}
                            className="flex-1 min-w-[8rem] rounded-lg border border-xxm-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
                          />
                        </div>
                        {/* Defaults to today, which is right for a payment being
                            recorded as it arrives. Editable because the same
                            form is the quickest way to date a late one
                            correctly, and a statement that puts three months of
                            payments on one afternoon is wrong. */}
                        <input
                          name="receivedAt" type="date" max={todayISO} defaultValue={todayISO}
                          aria-label={`Date the payment from ${fullName} arrived`}
                          className="w-full rounded-lg border border-xxm-gray-200 px-2.5 py-1.5 text-sm text-xxm-gray-600 focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
                        />
                        {/* The same requirement as the fuller form above, and
                            deliberately not a lighter one: a payment recorded
                            from this row is the same claim about the same
                            money. */}
                        <input
                          type="file" name="proof" accept={PROOF_ACCEPT}
                          aria-label={`Proof of the payment from ${fullName}`}
                          className="w-full rounded-lg border border-dashed border-xxm-gray-300 px-2.5 py-1.5 text-xs bg-white file:mr-2 file:rounded file:border-0 file:bg-xxm-green-50 file:px-2 file:py-1 file:text-[11px] file:font-semibold file:text-xxm-green-800 file:cursor-pointer hover:file:bg-xxm-green-100 focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
                        />
                        <label className="flex items-start gap-2 cursor-pointer">
                          <input
                            type="checkbox" name="noProof"
                            className="mt-0.5 w-3.5 h-3.5 rounded border-xxm-gray-300 text-xxm-green focus:ring-2 focus:ring-xxm-green/25 cursor-pointer shrink-0"
                          />
                          <span className="text-[11px] text-xxm-gray-500 leading-snug">
                            Cash — no proof of payment. Say who counted it:
                          </span>
                        </label>
                        <input
                          name="proofWitness" maxLength={300}
                          placeholder="Counted by … at the … meeting"
                          aria-label={`Who counted the cash from ${fullName}`}
                          className="w-full rounded-lg border border-xxm-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
                        />
                        <ConfirmSubmitButton
                          title="Record this payment?"
                          message={`This adds money to ${fullName}'s ${MONTHS[c.periodMonth - 1]} ${c.periodYear} contribution, stores the proof against it, and tells them it arrived. ${formatZAR(Number(c.amountDue) - Number(c.amountPaid))} is outstanding; anything more than that is still recorded and you will be told. Only do this once the money is actually in the account.`}
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
                              {/* The bank reference for an offline row, the
                                  gateway's for everything else. Both answer the
                                  same question — what do I match this against —
                                  and an offline row has no gatewayRef at all,
                                  so it would otherwise show a dash on the one
                                  payment kind that cannot be traced any other
                                  way. */}
                              <span className="font-mono text-[10px] text-xxm-gray-400 truncate">
                                {t.offlineReference ?? t.gatewayRef ?? '—'}
                              </span>
                              {/* When the money arrived, falling back to when
                                  the row was written. For a backlog these are
                                  months apart and only the first is true. */}
                              <span className="text-[11px] text-xxm-gray-400 ml-auto">
                                {new Date(t.processedAt ?? t.createdAt).toLocaleDateString('en-ZA')}
                              </span>
                            </div>

                            {/* What this payment rests on. An admin opening it
                                is the reconciliation step — matching the
                                document against the bank statement — so it is
                                one click from the row rather than somewhere
                                else. Served through /api/media, which refuses
                                any reference no row claims. */}
                            {t.proofUrl && (
                              <p className="mt-2">
                                <a
                                  href={`/api/media?ref=${encodeURIComponent(t.proofUrl)}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-xxm-green hover:text-xxm-canopy underline underline-offset-2"
                                >
                                  <FileText size={11} aria-hidden />
                                  View proof of payment
                                </a>
                              </p>
                            )}

                            {t.proofWitness && (
                              <p className="mt-2 text-[11px] text-xxm-gray-500">
                                <span className="font-semibold text-xxm-gray-600">Cash, counted by: </span>
                                {t.proofWitness}
                              </p>
                            )}

                            {/* Neither. Every offline row written from now on
                                carries one or the other, so this is a payment
                                recorded before proof was required — said
                                plainly rather than left as a blank somebody
                                could read as "document not loaded". */}
                            {t.type === 'OFFLINE' && !t.proofUrl && !t.proofWitness && (
                              <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-amber-700">
                                <TriangleAlert size={11} aria-hidden />
                                Recorded before proof of payment was required — no evidence attached.
                              </p>
                            )}

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
