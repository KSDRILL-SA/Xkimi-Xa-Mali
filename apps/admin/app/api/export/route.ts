import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

function rands(n: number) {
  return `R ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`
}

function csvCell(value: string | number | null | undefined): string {
  const str = value == null ? '' : String(value)
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

export async function GET(req: NextRequest) {
  const session = await auth()
  const roles   = (session?.user?.roles as string[] | undefined) ?? []
  if (!session?.user?.id || !roles.includes('ADMIN')) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const month = Math.min(12, Math.max(1, parseInt(searchParams.get('month') ?? '0', 10)))
  const year  = Math.max(2024, parseInt(searchParams.get('year') ?? '0', 10))

  if (!month || !year) {
    return new NextResponse('Missing month or year', { status: 400 })
  }

  const contributions = await db.contribution.findMany({
    where: { periodMonth: month, periodYear: year },
    select: {
      amountDue:  true,
      amountPaid: true,
      dueDate:    true,
      status:     true,
      user: {
        select: {
          firstName: true,
          lastName:  true,
          email:     true,
          phone:     true,
        },
      },
    },
    orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
  })

  const periodLabel = `${MONTHS[month - 1] ?? `Month ${month}`} ${year}`
  const generatedAt = new Date().toLocaleString('en-ZA', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  })

  const totalDue  = contributions.reduce((s, c) => s + Number(c.amountDue), 0)
  const totalPaid = contributions.reduce((s, c) => s + Number(c.amountPaid), 0)
  const outstanding = Math.max(0, totalDue - totalPaid)
  const paidCount   = contributions.filter((c) => c.status === 'PAID').length
  const collectionRate = contributions.length > 0
    ? Math.round((paidCount / contributions.length) * 100)
    : 0

  const headerTitle = [
    `XKIMM XA MALI — CONTRIBUTION REPORT`,
    `Period: ${periodLabel}`,
    `Generated: ${generatedAt}`,
    '',
  ]

  const columnHeaders = [
    'Member Name',
    'Email Address',
    'Phone Number',
    'Amount Due (R)',
    'Amount Paid (R)',
    'Outstanding (R)',
    'Due Date',
    'Status',
  ].map(csvCell).join(',')

  const rows = contributions.map((c) => {
    const balance = Math.max(0, Number(c.amountDue) - Number(c.amountPaid))
    return [
      csvCell(`${c.user.firstName} ${c.user.lastName}`),
      csvCell(c.user.email),
      csvCell(c.user.phone),
      Number(c.amountDue).toFixed(2),
      Number(c.amountPaid).toFixed(2),
      balance.toFixed(2),
      csvCell(c.dueDate ? new Date(c.dueDate).toLocaleDateString('en-ZA') : ''),
      csvCell(c.status),
    ].join(',')
  })

  const summarySection = [
    '',
    '--- SUMMARY ---',
    `Period,${csvCell(periodLabel)}`,
    `Total Members,${contributions.length}`,
    `Members Paid,${paidCount}`,
    `Collection Rate,${collectionRate}%`,
    `Total Due,${rands(totalDue)}`,
    `Total Paid,${rands(totalPaid)}`,
    `Outstanding,${rands(outstanding)}`,
    `Generated,${csvCell(generatedAt)}`,
  ]

  const lines = [
    ...headerTitle,
    columnHeaders,
    ...rows,
    ...summarySection,
  ]

  const BOM      = '﻿'
  const csv      = BOM + lines.join('\r\n')
  const filename = `xkimm-xa-mali-report-${year}-${String(month).padStart(2, '0')}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
