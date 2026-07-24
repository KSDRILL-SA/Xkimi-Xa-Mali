'use client'

import { useRef, useState, type ReactNode } from 'react'
import { ConfirmModal } from '@xxm/ui'

interface Props {
  children: ReactNode
  className?: string
  title: string
  message: string
  confirmLabel?: string
}

/**
 * A submit button that gates its enclosing server-action `<form>` behind the
 * shared accessible confirmation dialog. Renders a type="button" (so it never
 * submits directly); on confirm it calls requestSubmit() on its own form, which
 * runs the server action with all named fields intact. Use for destructive or
 * high-impact admin actions (role changes, suspensions, reversals) so a misclick
 * cannot fire them.
 */
export function ConfirmSubmitButton({ children, className, title, message, confirmLabel }: Props) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button ref={btnRef} type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <ConfirmModal
        open={open}
        title={title}
        message={message}
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
