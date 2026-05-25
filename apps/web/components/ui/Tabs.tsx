'use client'

import { useState } from 'react'
import { clsx } from 'clsx'

export interface Tab {
  id: string
  label: string
  content: React.ReactNode
}

export function Tabs({ tabs, initial }: { tabs: Tab[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id)

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={clsx(
              'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px',
              active === tab.id
                ? 'border-xxm-green text-xxm-green'
                : 'border-transparent text-gray-500 hover:text-xxm-green-900',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="pt-6">{tabs.find((t) => t.id === active)?.content}</div>
    </div>
  )
}
