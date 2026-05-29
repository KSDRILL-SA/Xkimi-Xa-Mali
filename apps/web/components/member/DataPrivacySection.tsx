'use client'

import { Button } from '@/components/ui/Button'

export function DataPrivacySection({ userId }: { userId: string }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 p-4">
        <h4 className="text-sm font-semibold text-xxm-green-900">Export your data</h4>
        <p className="text-xs text-xxm-gray-500 mt-1 mb-3">
          Download a complete copy of your personal information, contributions, and account
          activity in JSON format, as guaranteed under POPIA.
        </p>
        <Button variant="secondary" size="sm" asChild>
          <a href={`/api/v1/members/${userId}/export`} download>
            Download my data
          </a>
        </Button>
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <h4 className="text-sm font-semibold text-xxm-green-900">Privacy</h4>
        <p className="text-xs text-xxm-gray-500 mt-1">
          Your personal information is processed solely for managing your Xkimm Xa Mali
          contributions. Sensitive details such as your ID and bank account numbers are
          encrypted at rest and never shared beyond our payment processor.
        </p>
      </div>
    </div>
  )
}
