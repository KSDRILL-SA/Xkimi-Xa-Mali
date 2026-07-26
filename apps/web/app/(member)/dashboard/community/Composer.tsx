'use client'

import { useRef } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { EmojiPicker } from './EmojiPicker'
import { MAX_CONTENT_LENGTH } from './message-types'

export function Composer({
  value, onChange, onSubmit, onCancel,
  placeholder, disabled, submitLabel, loading, autoFocus, footerLeft,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  onCancel?: () => void
  placeholder: string
  disabled?: boolean
  submitLabel: string
  loading?: boolean
  autoFocus?: boolean
  footerLeft?: React.ReactNode
}) {
  const taRef = useRef<HTMLTextAreaElement>(null)

  function insertEmoji(emoji: string) {
    const ta = taRef.current
    if (!ta) { onChange(value + emoji); return }
    const start = ta.selectionStart ?? value.length
    const end = ta.selectionEnd ?? value.length
    const next = value.slice(0, start) + emoji + value.slice(end)
    if (next.length > MAX_CONTENT_LENGTH) return
    onChange(next)
    requestAnimationFrame(() => {
      ta.focus()
      const caret = start + emoji.length
      ta.setSelectionRange(caret, caret)
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="rounded-2xl border border-xxm-gray-200 bg-white focus-within:border-xxm-green/40 focus-within:ring-2 focus-within:ring-xxm-green/15 transition-all">
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={MAX_CONTENT_LENGTH}
        rows={2}
        disabled={disabled}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full bg-transparent px-4 pt-3 pb-1.5 text-sm text-xxm-gray-800 placeholder:text-xxm-gray-400 resize-none focus:outline-none disabled:opacity-60"
      />
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
        <div className="flex items-center gap-1.5">
          <EmojiPicker onPick={insertEmoji} />
          {footerLeft}
        </div>
        <div className="flex items-center gap-2.5">
          <span className={`text-[11px] tabular-nums ${value.length > MAX_CONTENT_LENGTH - 50 ? 'text-amber-500 font-semibold' : 'text-xxm-gray-300'}`}>
            {value.length}/{MAX_CONTENT_LENGTH}
          </span>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-semibold text-xxm-gray-400 hover:text-xxm-gray-600 transition-colors px-1.5"
            >
              Cancel
            </button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={!value.trim() || disabled}
            loading={loading}
          >
            <Send size={13} className="mr-1.5" aria-hidden />
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
