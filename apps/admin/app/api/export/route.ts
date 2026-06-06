import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

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
      status:     true,
      user: { select: { firstName: true, lastName: true, email: true } },
    },
    orderBy: [{ user: { lastName: 'asc' } }, { user: { firstName: 'asc' } }],
  })

  const header = 'Member,Email,Amount Due (R),Amount Paid (R),Status'
  const rows   = contributions.map((c) =>
    `"${c.user.firstName} ${c.user.lastName}","${c.user.email}",${Number(c.amountDue).toFixed(2)},${Number(c.amountPaid).toFixed(2)},${c.status}`
  )
  const csv      = [header, ...rows].join('\n')
  const filename = `xxm-report-${year}-${String(month).padStart(2, '0')}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
