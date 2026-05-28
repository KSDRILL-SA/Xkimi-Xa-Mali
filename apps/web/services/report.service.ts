import { put, getDownloadUrl } from '@vercel/blob'
import { db } from '@/lib/db'
import { renderStatementPDF } from '@/lib/pdf/statement'
import type { StatementData } from '@/lib/pdf/statement'
import type { TransactionFilter } from '@/lib/validation/report'
import { MONTHS } from '@/lib/date'

// ─── Domain errors ────────────────────────────────────────────────────────────

export class ReportNotFoundError extends Error {
  code = 'RPT_001'
  status = 404
  constructor(msg = 'No data found for the requested period') { super(msg) }
}

export class ReportForbiddenError extends Error {
  code = 'RPT_002'
  status = 403
  constructor() { super('Access denied') }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function periodLabel(month: number, year: number): string {
  const name = MONTHS?.[month - 1] ?? `Month ${month}`
  return `${name} ${year}`
}

function assertCanAccess(targetUserId: string, requesterId: string, roles: string[]) {
  if (targetUserId !== requesterId && !roles.includes('ADMIN')) {
    throw new ReportForbiddenError()
  }
}

// ─── Transaction history ──────────────────────────────────────────────────────

type TxRow = {
  id: string
  amount: unknown
  type: string
  status: string
  gatewayRef: string | null
  idempotencyKey: string
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
    db.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        contribution: {
          select: { id: true, periodMonth: true, periodYear: true, userId: true },
        },
      },
    }),
    db.transaction.count({ where }),
  ])

  return {
    items: (items as TxRow[]).map((t) => ({
      id: t.id,
      amount: Number(t.amount),
      type: t.type,
      status: t.status,
      gatewayRef: t.gatewayRef,
      idempotencyKey: t.idempotencyKey,
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

export async function generateMemberStatement(
  userId: string,
  requesterId: string,
  roles: string[],
  month: number,
  year: number,
): Promise<{ url: string; signedUrl: string }> {
  assertCanAccess(userId, requesterId, roles)

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, email: true, phone: true },
  })
  if (!user) throw new ReportNotFoundError('Member not found')

  const contributions = await db.contribution.findMany({
    where: { userId, periodYear: year },
    orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    include: {
      transactions: {
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  const periodContributions = (contributions as unknown as ContribWithTx[]).filter(
    (c) => c.periodMonth === month && c.periodYear === year,
  )

  const allTransactions = periodContributions.flatMap((c) => c.transactions)

  const data: StatementData = {
    member: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
    },
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
      totalDue: periodContributions.reduce((s, c) => s + Number(c.amountDue), 0),
      totalPaid: periodContributions.reduce((s, c) => s + Number(c.amountPaid), 0),
      outstanding: periodContributions
        .filter((c) => c.status !== 'PAID' && c.status !== 'WAIVED')
        .reduce((s, c) => s + (Number(c.amountDue) - Number(c.amountPaid)), 0),
    },
    generatedAt: new Date().toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  }

  const pdfBuffer = await renderStatementPDF(data)

  const blobPath = `statements/${userId}/${year}-${String(month).padStart(2, '0')}.pdf`
  const blob = await put(blobPath, pdfBuffer, {
    access: 'public',
    contentType: 'application/pdf',
    addRandomSuffix: false,
  })

  // Generate a download-forced URL (content-disposition: attachment)
  const signedUrl = getDownloadUrl(blob.url)

  return { url: blob.url, signedUrl }
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
  const members = await db.user.findMany({
    where: { status: 'ACTIVE' },
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
  })

  const allContribs = await db.contribution.findMany({
    where: { periodMonth: month, periodYear: year },
    select: { amountDue: true, amountPaid: true, status: true },
  })

  const typed = allContribs as RawContrib[]
  const totalDue   = typed.reduce((s, c) => s + Number(c.amountDue), 0)
  const totalPaid  = typed.reduce((s, c) => s + Number(c.amountPaid), 0)
  const paidCount  = typed.filter((c) => c.status === 'PAID').length
  const collectionRate = typed.length > 0
    ? Math.round((paidCount / typed.length) * 100)
    : 0

  const poolTotal = await db.contribution.aggregate({
    where: { status: 'PAID' },
    _sum: { amountPaid: true },
  })

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
    members: (members as MemberReportRow[]).map((m) => {
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
          ? Math.max(0, Number(contrib.amountDue) - Number(contrib.amountPaid))
          : 0,
      }
    }),
  }
}

// ─── CSV export ───────────────────────────────────────────────────────────────

export async function exportAdminReportCSV(month: number, year: number): Promise<string> {
  const report = await getAdminReport(month, year)

  const headers = ['Name', 'Email', 'Phone', 'Amount Due', 'Amount Paid', 'Outstanding', 'Status']
  const rows = report.members.map((m) =>
    [
      `"${m.name}"`,
      `"${m.email}"`,
      `"${m.phone}"`,
      m.amountDue.toFixed(2),
      m.amountPaid.toFixed(2),
      m.outstanding.toFixed(2),
      m.status,
    ].join(','),
  )

  const summary = [
    '',
    `"Total Due",${report.summary.totalDue.toFixed(2)}`,
    `"Total Paid",${report.summary.totalPaid.toFixed(2)}`,
    `"Outstanding",${report.summary.outstanding.toFixed(2)}`,
    `"Collection Rate",${report.summary.collectionRate}%`,
    `"Pool Total (all time)",${report.summary.poolTotal.toFixed(2)}`,
    `"Generated",${new Date().toISOString()}`,
  ]

  return [headers.join(','), ...rows, ...summary].join('\n')
}
