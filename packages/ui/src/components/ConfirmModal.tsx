'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import { AlertTriangle } from 'lucide-react'

interface ConfirmModalProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * The dialog that stands in front of an action that cannot be undone.
 *
 * ── Why it renders into the body ────────────────────────────────────────────
 *
 * It positions itself with `fixed inset-0`, which means "the viewport" only
 * while no ancestor has a transform, filter or perspective. Any of those makes
 * the ancestor the containing block instead, and the dialog covers that element
 * rather than the screen — a full-page overlay rendered inside a card, with the
 * page still scrollable behind it.
 *
 * The entry animations that used to leave a transform on `<main>` are fixed, so
 * this works where it stands today. It is portalled anyway, because "no
 * ancestor anywhere up the tree does anything transform-like" is not a property
 * a component can rely on being preserved by whoever nests it next.
 */
export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  loading,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  // Unique per instance. The id was hardcoded, so two dialogs mounted at once
  // both claimed `confirm-title` and every `aria-labelledby` pointed at
  // whichever the browser found first.
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // Escape closes. Kept in its own effect so it does not re-run — and re-lock
  // the page — every time the parent re-renders with a new inline `onCancel`.
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancelRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) return
    // Restore whatever was there rather than assuming it was the default: a
    // dialog opened from inside another locked surface used to unlock the page
    // for both of them on the way out.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    // Move focus into the dialog, and give it back when the dialog goes. A
    // keyboard user was otherwise left on the trigger behind the overlay,
    // tabbing through a page they could not see.
    const restoreTo = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => restoreTo?.focus?.()
  }, [open])

  if (!open || !mounted) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden
      />

      {/* Panel — slides up from bottom on mobile */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-sm bg-white rounded-2xl shadow-xxm-lg p-6 space-y-4 animate-fade-in-up outline-none"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle size={17} className="text-red-600" aria-hidden />
          </div>
          <div>
            <h3 id={titleId} className="text-base font-bold text-xxm-green-900 leading-snug">
              {title}
            </h3>
            <p className="text-sm text-gray-500 mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
