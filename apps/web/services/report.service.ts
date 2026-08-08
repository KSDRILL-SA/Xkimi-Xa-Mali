import { storageProvider } from '@/integrations/storage'
import { renderStatementPDF } from '@/lib/pdf/statement'
import type { StatementData } from '@/lib/pdf/statement'
import { renderContributionReportPDF } from '@/lib/pdf/contribution-report'
import type { ContributionReportData } from '@/lib/pdf/contribution-report'
import type { TransactionFilter } from '@/lib/validation/report'
import { MONTHS } from '@/lib/date'
import { roundZAR, subtractZAR } from '@/lib/money'
import { ReportNotFoundError } from '@/lib/errors'
import { assertCanAccess, assertAdmin } from '@/lib/authorization'
import { transactionRepo } from '@/repositories/transaction.repository'
import { userRepo } from '@/repositories/user.repository'
import { contributionRepo } from '@/repositories/contribution.repository'
import { bankAccountRepo } from '@/repositories/bank-account.repository'
import { maskStoredSecret } from '@/lib/encryption'
import { isFounder } from '@/services/distinction.service'
import { embedSignatureInPdf, verifySignatureExists } from './signature.service'

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

export { ReportNotFoundError }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function periodLabel(month: number, year: number): string {
  const name = MONTHS?.[month - 1] ?? `Month ${month}`
  return `${name} ${year}`
}

// ─── Transaction history ──────────────────────────────────────────────────────

type TxRow = {
  id: string
  amount: unknown
  type: string
  status: string
  gatewayRef: string | null
  idempotencyKey: string
  reversalReason: string | null
  processedAt: Date | null
  createdAt: Date
  contribution: {
    id: string
    periodMonth: number
    periodYear: number
    userId: string
  }
}

export async function getTransactionHistory(
  userId: string,
  requesterId: string,
  roles: string[],
  filter: TransactionFilter,
) {
  assertCanAccess(userId, requesterId, roles)

  const { status, type, from, to, page, limit } = filter

  const where = {
    contribution: { userId },
    ...(status && { status }),
    ...(type && { type }),
    ...(from || to
      ? {
          createdAt: {
            ...(from && { gte: new Date(from) }),
            ...(to && { lte: new Date(`${to}T23:59:59.999Z`) }),
          },
        }
      : {}),
  }

  const [items, total] = await Promise.all([
    transactionRepo.findMany(where, {
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        contribution: {
          select: { id: true, periodMonth: true, periodYear: true, userId: true },
        },
      },
    }),
    transactionRepo.count(where),
  ])

  return {
    items: (items as unknown as TxRow[]).map((t) => ({
      id: t.id,
      amount: Number(t.amount),
      type: t.type,
      status: t.status,
      gatewayRef: t.gatewayRef,
      idempotencyKey: t.idempotencyKey,
      // Null on everything that is not a reversing entry, and on reversals
      // written before a reason was required.
      reversalReason: t.reversalReason ?? null,
      period: periodLabel(t.contribution.periodMonth, t.contribution.periodYear),
      processedAt: t.processedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

// ─── Statement PDF generation ─────────────────────────────────────────────────

type ContribWithTx = {
  id: string
  periodMonth: number
  periodYear: number
  amountDue: unknown
  amountPaid: unknown
  dueDate: Date
  status: string
  transactions: TxRow[]
}

type UserRow = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  createdAt: Date
}

function buildDocRef(userId: string, month: number, year: number): string {
  const short = userId.replace(/-/g, '').slice(0, 8).toUpperCase()
  const ts = Date.now().toString(36).toUpperCase().slice(-4)
  return `XMM-${year}${String(month).padStart(2, '0')}-${short}-${ts}`
}

function formatMemberId(userId: string): string {
  return `XMM-${userId.replace(/-/g, '').slice(0, 6).toUpperCase()}`
}

async function buildStatementData(
  userId: string,
  month: number,
  year: number,
): Promise<StatementData> {
  // The institutional signature is embedded when configured; statements still
  // generate (unsigned) if an admin hasn't set one up yet.
  const signature = await verifySignatureExists().catch((): null => null)

  const userResults = await userRepo.findMany({ id: userId }, {
    take: 1,
    select: { id: true, firstName: true, lastName: true, email: true, phone: true, createdAt: true },
  })
  const user = (userResults[0] ?? null) as UserRow | null
  if (!user) throw new ReportNotFoundError('Member not found')

  const contributions = await contributionRepo.findMany(
    { userId, periodYear: year },
    {
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
        },
      },
    },
  )

  const periodContributions = (contributions as unknown as ContribWithTx[]).filter(
    (c) => c.periodMonth === month && c.periodYear === year,
  )

  const allTransactions = periodContributions.flatMap((c) => c.transactions)

  // Primary banking details (the account contributions are debited from).
  const bankAccounts = await bankAccountRepo.findByUser(userId, [
    { isPrimary: 'desc' }, { createdAt: 'asc' },
  ])
  const primaryAccount = bankAccounts[0] ?? null
  const banking = primaryAccount
    ? {
        bankName:            primaryAccount.bankName,
        accountNumberMasked: maskStoredSecret(primaryAccount.accountNumber, {
          field: 'bankAccount.accountNumber',
          bankAccountId: primaryAccount.id,
          userId,
        }),
        accountType:         titleCase(primaryAccount.accountType),
        branchCode:          primaryAccount.branchCode,
        verified:            primaryAccount.verifiedAt !== null,
      }
    : null

  const signatureImage = signature
    ? await embedSignatureInPdf(signature.signatureUrl).catch((): null => null)
    : null

  // Conferred, and permanent — so it belongs on a document that is a permanent
  // record. Read from its own service; the badge tier is not on a statement at
  // all, so there is nothing here for it to be confused with.
  const founder = await isFounder(userId)

  return {
    member: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      memberId: formatMemberId(user.id),
      memberSince: user.createdAt.toLocaleDateString('en-ZA', {
        day: 'numeric', month: 'long', year: 'numeric',
      }),
      isFounder: founder,
    },
    banking,
    period: { month, year, label: periodLabel(month, year) },
    contributions: periodContributions.map((c) => ({
      id: c.id,
      periodLabel: periodLabel(c.periodMonth, c.periodYear),
      amountDue: Number(c.amountDue),
      amountPaid: Number(c.amountPaid),
      status: c.status,
      dueDate: c.dueDate.toLocaleDateString('en-ZA'),
    })),
    transactions: allTransactions.map((t) => ({
      id: t.id,
      amount: Number(t.amount),
      type: t.type,
      status: t.status,
      gatewayRef: t.gatewayRef,
      processedAt: t.processedAt?.toLocaleDateString('en-ZA') ?? null,
      createdAt: t.createdAt.toLocaleDateString('en-ZA'),
    })),
    summary: {
      totalDue: periodContributions.reduce((s, c) => roundZAR(s + Number(c.amountDue)), 0),
      totalPaid: periodContributions.reduce((s, c) => roundZAR(s + Number(c.amountPaid)), 0),
      outstanding: periodContributions
        .filter((c) => c.status !== 'PAID' && c.status !== 'WAIVED')
        .reduce((s, c) => roundZAR(s + subtractZAR(Number(c.amountDue), Number(c.amountPaid))), 0),
    },
    generatedAt: new Date().toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    docRef: buildDocRef(userId, month, year),
    signature: signature && signatureImage
      ? { imageDataUri: signatureImage, displayName: signature.displayName }
      : null,
  }
}

export async function generateMemberStatementPdf(
  userId: string,
  requesterId: string,
  roles: string[],
  month: number,
  year: number,
): Promise<Buffer> {
  assertCanAccess(userId, requesterId, roles)
  const data = await buildStatementData(userId, month, year)
  return renderStatementPDF(data)
}

export async function generateMemberStatement(
  userId: string,
  requesterId: string,
  roles: string[],
  month: number,
  year: number,
): Promise<{ url: string; signedUrl: string }> {
  assertCanAccess(userId, requesterId, roles)

  const data = await buildStatementData(userId, month, year)
  const pdfBuffer = await renderStatementPDF(data)

  const blobPath = `statements/${userId}/${year}-${String(month).padStart(2, '0')}.pdf`
  const result = await storageProvider.upload(blobPath, pdfBuffer, {
    access: 'public',
    contentType: 'application/pdf',
    addRandomSuffix: false,
  })

  return { url: result.url, signedUrl: result.signedUrl }
}

// ─── Admin reports ────────────────────────────────────────────────────────────

type RawContrib = {
  amountDue: unknown
  amountPaid: unknown
  status: string
}

type MemberReportRow = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  status: string
  contributions: Array<{
    id: string
    periodMonth: number
    periodYear: number
    amountDue: unknown
    amountPaid: unknown
    status: string
  }>
}

export async function getAdminReport(month: number, year: number) {
  const members = await userRepo.findMany(
    { status: 'ACTIVE' },
    {
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        status: true,
        contributions: {
          where: { periodMonth: month, periodYear: year },
          select: {
            id: true,
            periodMonth: true,
            periodYear: true,
            amountDue: true,
            amountPaid: true,
            status: true,
          },
        },
      },
    },
  )

  const allContribs = await contributionRepo.findMany(
    { periodMonth: month, periodYear: year },
    {
      select: { amountDue: true, amountPaid: true, status: true },
    },
  )

  const typed = allContribs as RawContrib[]
  const totalDue   = typed.reduce((s, c) => s + Number(c.amountDue), 0)
  const totalPaid  = typed.reduce((s, c) => s + Number(c.amountPaid), 0)
  const paidCount  = typed.filter((c) => c.status === 'PAID').length
  const collectionRate = typed.length > 0
    ? Math.round((paidCount / typed.length) * 100)
    : 0

  const poolTotal = await contributionRepo.aggregate(
    { status: 'PAID' },
    { _sum: { amountPaid: true } },
  )

  return {
    period: { month, year, label: periodLabel(month, year) },
    summary: {
      totalDue,
      totalPaid,
      outstanding: totalDue - totalPaid,
      collectionRate,
      memberCount: members.length,
      paidCount,
      overdueCount: typed.filter((c) => c.status === 'OVERDUE').length,
      poolTotal: Number(poolTotal._sum?.amountPaid ?? 0),
    },
    members: (members as unknown as MemberReportRow[]).map((m) => {
      const contrib = m.contributions[0]
      return {
        id: m.id,
        name: `${m.firstName} ${m.lastName}`,
        email: m.email,
        phone: m.phone,
        amountDue: contrib ? Number(contrib.amountDue) : 0,
        amountPaid: contrib ? Number(contrib.amountPaid) : 0,
        status: contrib?.status ?? 'NO_RECORD',
        outstanding: contrib
          ? Math.max(0, subtractZAR(Number(contrib.amountDue), Number(contrib.amountPaid)))
          : 0,
      }
    }),
  }
}

// ─── CSV export ───────────────────────────────────────────────────────────────

function csvCell(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value)
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

function rands(n: number): string {
  return `R ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`
}

export async function exportAdminReportCSV(month: number, year: number): Promise<string> {
  const report = await getAdminReport(month, year)

  const generatedAt = new Date().toLocaleString('en-ZA', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  })

  const headerTitle = [
    'XKIMM XA MALI FOUNDATION — CONTRIBUTION REPORT',
    `Period: ${report.period.label}`,
    `Generated: ${generatedAt}`,
    '',
  ]

  const columnHeaders = [
    'Member Name', 'Email Address', 'Phone Number',
    'Amount Due (R)', 'Amount Paid (R)', 'Outstanding (R)', 'Status',
  ].map(csvCell).join(',')

  const rows = report.members.map((m) =>
    [
      csvCell(m.name),
      csvCell(m.email),
      csvCell(m.phone),
      m.amountDue.toFixed(2),
      m.amountPaid.toFixed(2),
      m.outstanding.toFixed(2),
      csvCell(m.status),
    ].join(','),
  )

  const summarySection = [
    '',
    '--- SUMMARY ---',
    `Period,${csvCell(report.period.label)}`,
    `Total Members,${report.summary.memberCount}`,
    `Members Paid,${report.summary.paidCount}`,
    `Members Overdue,${report.summary.overdueCount}`,
    `Collection Rate,${report.summary.collectionRate}%`,
    `Total Due,${rands(report.summary.totalDue)}`,
    `Total Paid,${rands(report.summary.totalPaid)}`,
    `Outstanding,${rands(report.summary.outstanding)}`,
    `Pool Total (all-time),${rands(report.summary.poolTotal)}`,
    `Generated,${csvCell(generatedAt)}`,
  ]

  return [...headerTitle, columnHeaders, ...rows, ...summarySection].join('\r\n')
}

// ─── Admin report PDF ───────────────────────────────────────────────────────────

export async function generateContributionReportPdf(
  roles: string[],
  month: number,
  year: number,
): Promise<Buffer> {
  assertAdmin(roles)

  const report = await getAdminReport(month, year)

  // Signature is embedded when configured; the report still generates otherwise.
  const signature = await verifySignatureExists().catch((): null => null)
  const signatureImage = signature
    ? await embedSignatureInPdf(signature.signatureUrl).catch((): null => null)
    : null

  const ts = Date.now().toString(36).toUpperCase().slice(-4)
  const docRef = `XMM-RPT-${year}${String(month).padStart(2, '0')}-${ts}`
  const generatedAt = new Date().toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  const data: ContributionReportData = {
    period:    report.period,
    summary:   report.summary,
    members:   report.members,
    generatedAt,
    docRef,
    signature: signature && signatureImage
      ? { imageDataUri: signatureImage, displayName: signature.displayName }
      : null,
  }

  return renderContributionReportPDF(data)
}
