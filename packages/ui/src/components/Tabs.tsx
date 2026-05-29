'use client'

import { useState, useRef } from 'react'
import { cn } from '@xxm/utils'

export interface Tab {
  id: string
  label: string
  content: React.ReactNode
}

export function Tabs({ tabs, initial }: { tabs: Tab[]; initial?: string }) {
  const [active, setActive] = useState(initial ?? tabs[0]?.id)
  const listRef = useRef<HTMLDivElement>(null)

  function handleKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next = e.key === 'ArrowRight'
      ? (idx + 1) % tabs.length
      : (idx - 1 + tabs.length) % tabs.length
    const nextId = tabs[next]!.id
    setActive(nextId)
    listRef.current?.querySelector<HTMLButtonElement>(`#tab-${nextId}`)?.focus()
  }

  return (
    <div>
      <div
        ref={listRef}
        role="tablist"
        aria-label="Page sections"
        className="flex gap-0.5 border-b border-gray-200 overflow-x-auto scrollbar-none"
      >
        {tabs.map((tab, idx) => (
          <button
            key={tab.id}
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            tabIndex={active === tab.id ? 0 : -1}
            onClick={() => setActive(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
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
