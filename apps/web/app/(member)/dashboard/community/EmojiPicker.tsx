'use client'

import { useEffect, useRef, useState } from 'react'
import { Smile } from 'lucide-react'
import { EMOJIS } from './message-types'

export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-xxm-gray-400 hover:text-xxm-gold-dark hover:bg-xxm-gold/10 transition-colors"
        aria-label="Add emoji"
      >
        <Smile size={17} aria-hidden />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 z-30 w-64 rounded-2xl border border-xxm-gray-100 bg-white shadow-xxm-lg p-2.5 animate-scale-in origin-bottom-left">
          <div className="grid grid-cols-8 gap-0.5">
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => { onPick(emoji); setOpen(false) }}
                className="w-7 h-7 rounded-lg text-lg leading-none flex items-center justify-center hover:bg-xxm-green-50 transition-colors"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
