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

  /**
   * Next signals navigation by throwing, so those throws must pass through.
   *
   * `redirect()` and `notFound()` raise errors carrying a `NEXT_REDIRECT` or
   * `NEXT_HTTP_ERROR_FALLBACK` digest, which the framework catches higher up and
   * turns into a redirect or a 404. An error boundary that treats every throw as
   * a failure swallows them — so a section calling `redirect('/login')` would
   * quietly disappear from the page instead of sending the member to sign in.
   *
   * That was live from the moment this component shipped. It is why the
   * dashboard sections guard by returning null rather than redirecting, and it
   * is fixed here so the next person is not held to that workaround.
   */
  private static isNavigation(error: unknown): boolean {
    const digest = (error as { digest?: unknown })?.digest
    return typeof digest === 'string' && (
      digest === 'NEXT_REDIRECT' ||
      digest.startsWith('NEXT_REDIRECT') ||
      digest.startsWith('NEXT_HTTP_ERROR_FALLBACK')
    )
  }

  static getDerivedStateFromError(error: unknown): State {
    if (SectionBoundary.isNavigation(error)) throw error
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    if (SectionBoundary.isNavigation(error)) throw error

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
