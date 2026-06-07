'use client'

import { DataTable, type Column } from '@xxm/ui'

export type InviteRow = {
  id: string; name: string; email: string; phone: string; rawStatus: string
  status: string; statusClass: string; minAmount: string; expires: string; accepted: string
}

type RevokeAction = (formData: FormData) => Promise<void>

export function InvitationsTable({
  rows, revokeAction,
}: {
  rows: InviteRow[]
  revokeAction: RevokeAction
}) {
  const columns: Column<InviteRow>[] = [
    {
      key: 'name', header: 'Invited Person', sortable: true,
      render: (r) => (
        <div>
          <p className="font-medium text-xxm-green-900">{r.name}</p>
          <p className="text-xs text-xxm-gray-400">{r.email}</p>
        </div>
      ),
    },
    { key: 'phone',     header: 'Phone',   render: (r) => <span className="font-mono text-xs">{r.phone}</span> },
    { key: 'minAmount', header: 'Min/mo',  align: 'right' },
    { key: 'status',    header: 'Status',  align: 'center', render: (r) => <span className={r.statusClass}>{r.status}</span> },
    { key: 'expires',   header: 'Expires' },
    { key: 'accepted',  header: 'Accepted' },
    {
      key: 'id', header: 'Actions', align: 'center',
      render: (r) => {
        if (r.rawStatus !== 'PENDING') return null
        return (
          <form action={revokeAction}>
            <input type="hidden" name="id" value={r.id} />
            <button type="submit" className="text-xs text-red-500 hover:underline font-medium">
              Revoke
            </button>
          </form>
        )
      },
    },
  ]

  return <DataTable columns={columns} data={rows} keyExtractor={(r) => r.id} stickyHeader striped caption="Invitations" />
}
