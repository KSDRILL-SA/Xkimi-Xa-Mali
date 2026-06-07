'use client'

import Link from 'next/link'
import { DataTable, type Column } from '@xxm/ui'

export type MandateRow = {
  id: string; mandateId: string; member: string; email: string; bank: string
  amount: string; debitDay: number; status: string; statusClass: string; createdAt: string
}

type MandateAction = (formData: FormData) => Promise<void>

export function MandatesTable({
  rows, approveAction, rejectAction,
}: {
  rows: MandateRow[]
  approveAction: MandateAction
  rejectAction: MandateAction
}) {
  const columns: Column<MandateRow>[] = [
    {
      key: 'member', header: 'Member', sortable: true,
      render: (r) => (
        <div>
          <p className="font-medium text-xxm-green-900">{r.member}</p>
          <p className="text-xs text-xxm-gray-400">{r.email}</p>
        </div>
      ),
    },
    { key: 'bank',     header: 'Bank' },
    { key: 'amount',   header: 'Amount',   align: 'right' },
    { key: 'debitDay', header: 'Debit Day',align: 'center' },
    { key: 'status',   header: 'Status',   align: 'center', render: (r) => <span className={r.statusClass}>{r.status}</span> },
    { key: 'createdAt',header: 'Created' },
    {
      key: 'mandateId', header: 'Actions', align: 'center',
      render: (r) => (
        <div className="flex items-center gap-2 justify-center">
          {r.status === 'Pending' && (
            <>
              <form action={approveAction}>
                <input type="hidden" name="mandateId" value={r.mandateId} />
                <button type="submit" className="text-xs text-xxm-green hover:underline font-medium">Approve</button>
              </form>
              <form action={rejectAction}>
                <input type="hidden" name="mandateId" value={r.mandateId} />
                <button type="submit" className="text-xs text-red-600 hover:underline font-medium">Reject</button>
              </form>
            </>
          )}
          <Link href={`/members/${r.id}`} className="text-xs text-xxm-gray-400 hover:text-xxm-green">View</Link>
        </div>
      ),
    },
  ]

  return <DataTable columns={columns} data={rows} keyExtractor={(r) => r.mandateId} stickyHeader striped caption="Mandates" />
}
