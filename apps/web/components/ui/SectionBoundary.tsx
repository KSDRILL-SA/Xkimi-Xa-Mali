'use client'

import { Component, type ReactNode } from 'react'
import { logger } from '@xxm/observability'

/**
 * Keeps one failing section from taking the page with it.
 *
 * The dashboard is five independent sections behind five `<Suspense>`
 * boundaries. Suspense handles a section that is *slow*. It does nothing at all
 * for a section that *throws* — the error travels straight past it to the
 * nearest error boundary, which is the route's `error.tsx`, and that replaces
 * the whole page.
 *
 * So a forecast widget hitting a slow query, or a badge lookup finding Redis
 * unreachable, took down the member's home screen: their balance, their recent
 * contributions and the button that starts a payment, all replaced by an error
 * card because a nice-to-have panel could not render. On debit night that is
 * the difference between a member paying and a member calling somebody.
 *
 * The section is dropped instead. `label` names it for the log, so a section
 * that is quietly failing for everybody is still visible to us even though it
 * is invisible to them.
 */
interface Props {
  children: ReactNode
  /** What failed, for the log line. Never rendered. */
  label: string
  /** Shown in place of the section. Nothing, by default — a missing panel reads better than a broken one. */
  fallback?: ReactNode
}

interface State {
  failed: boolean
}

export class SectionBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    // A section vanishing silently is exactly how a broken dashboard goes
    // unnoticed for a month, so the disappearance is always reported even
    // though it is never shown.
    logger.error('Dashboard section failed to render', {
      section: this.props.label,
      reason: error.message,
    })
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null
    return this.props.children
  }
}
