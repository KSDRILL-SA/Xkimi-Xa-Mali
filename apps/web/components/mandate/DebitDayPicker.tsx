'use client'

import { cn } from '@/lib/utils'

interface Props {
  value: number
  onChange: (day: number) => void
  error?: string
}

const DAYS = Array.from({ length: 28 }, (_, i) => i + 1)

export function DebitDayPicker({ value, onChange, error }: Props) {
  return (
    <div>
      <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
        {DAYS.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => onChange(day)}
            className={cn(
              'h-9 w-full rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xxm-green',
              value === day
                ? 'bg-xxm-green text-white shadow-sm'
                : 'bg-gray-100 text-gray-700 hover:bg-xxm-green-100 hover:text-xxm-green-900',
            )}
          >
            {day}
          </button>
        ))}
      </div>
      {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
    </div>
  )
}
