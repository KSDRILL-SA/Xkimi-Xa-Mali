'use client'

import { useRef, useState, type ReactNode } from 'react'
import { ConfirmModal } from '@xxm/ui'

interface Props {
  children: ReactNode
  className?: string
  title: string
  /**
   * Static confirmation copy. Ignored on any click where `getMessage` is also
   * given and returns a value — the two are alternatives, not layered.
   */
  message: string
  /**
   * Read the form fresh at the moment this is clicked, instead of showing
   * fixed copy. For a confirmation that has to restate *what* is about to be
   * sent — an invitation's recipient, an amount — rather than only warning
   * that something irreversible is about to happen. Passed the button's own
   * form, since `formRef`/`this` are not available to a plain callback.
   */
  getMessage?: (form: HTMLFormElement | null) => string
  confirmLabel?: string
  /** Disables the trigger — e.g. while the form's own action is already pending. */
  disabled?: boolean
}

/**
 * A submit button that gates its enclosing server-action `<form>` behind the
 * shared accessible confirmation dialog. Renders a type="button" (so it never
 * submits directly); on confirm it calls requestSubmit() on its own form, which
 * runs the server action with all named fields intact. Use for destructive or
 * high-impact admin actions (role changes, suspensions, reversals) so a misclick
 * cannot fire them.
 *
 * The dialog is a second, later portal — its own confirm button lands at a
 * different point on screen from whatever was just clicked to open it, which is
 * what actually stops a misclick: nothing here is fast enough to out-think a
 * click that finds a different button already standing where the last one was.
 * A single trigger button that swapped itself for the real submit button in
 * place, keyed only on state, was exactly that trap — found live, 2026-09-15,
 * on the invitation form, where a click meant for "Review" could still land on
 * "Send invitation" once React had already swapped it in underneath the cursor.
 */
export function ConfirmSubmitButton({ children, className, title, message, getMessage, confirmLabel, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [resolvedMessage, setResolvedMessage] = useState(message)
  const btnRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => {
          const form = btnRef.current?.form ?? null
          // Same check a real submit button would fail on its own — done here
          // too, so an incomplete form shows its native "fill this in" bubble
          // instead of a confirmation dialog for a submission that cannot
          // actually go through yet.
          if (form && !form.reportValidity()) return
          setResolvedMessage(getMessage ? getMessage(form) : message)
          setOpen(true)
        }}
      >
        {children}
      </button>
      <ConfirmModal
        open={open}
        title={title}
        message={resolvedMessage}
        confirmLabel={confirmLabel}
        onConfirm={() => {
          setOpen(false)
          btnRef.current?.form?.requestSubmit()
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  )
}
