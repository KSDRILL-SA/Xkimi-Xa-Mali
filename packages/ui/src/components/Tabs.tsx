'use client'

import { useState } from 'react'
import { cn } from '@xxm/utils'

export interface Tab {
  id: string
  label: string
  content: React.ReactNode
}

export function Tabs({ tabs, initial }: { tabs: Tab[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id)

  return (
    <div>
      {/* Tab list — horizontally scrollable on mobile */}
      <div
        role="tablist"
        aria-label="Page sections"
        className="flex gap-0.5 border-b border-gray-200 overflow-x-auto scrollbar-none"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            onClick={() => setActive(tab.id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
              'border-b-2 -mb-px outline-none',
              'focus-visible:ring-2 focus-visible:ring-xxm-gold focus-visible:ring-inset rounded-t-md',
              active === tab.id
                ? 'border-xxm-green text-xxm-green'
                : 'border-transparent text-gray-500 hover:text-xxm-green-900 hover:border-gray-300',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`tabpanel-${tab.id}`}
          aria-labelledby={`tab-${tab.id}`}
          hidden={active !== tab.id}
          className="pt-6"
        >
          {active === tab.id && tab.content}
        </div>
      ))}
    </div>
  )
}
