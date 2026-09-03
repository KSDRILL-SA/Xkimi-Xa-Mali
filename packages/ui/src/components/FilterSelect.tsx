'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useId } from 'react'
import { cn } from '@xxm/utils'

export type FilterOption = { value: string; label: string }

interface FilterSelectProps {
  /** Shown above the control. Say what is being narrowed, not "Filter". */
  label: string
  /** The query parameter this control owns. */
  name: string
  /** The current value, or undefined for "everything". */
  value?: string
  options: readonly FilterOption[]
  /** The label for the unfiltered case. */
  allLabel?: string
  className?: string
}

/**
 * One dropdown for one query parameter.
 *
 * ── Why a dropdown and not a row of pills ───────────────────────────────────
 *
 * The transactions page offered five statuses and five types as twelve pills
 * laid out across two rows. Every option was equally loud whether or not
 * anybody wanted it, the current selection was one highlighted chip among
 * eleven, and on a phone the rows wrapped into a block of tapping targets
 * taller than the first transaction. A list of possibilities is not the same
 * thing as a choice, and it reads as clutter precisely because nothing about it
 * says which part matters.
 *
 * A closed dropdown shows the one thing that is true — "Status: Success" —
 * and hides the eleven that are not until asked.
 *
 * ── Preserving the rest of the query ────────────────────────────────────────
 *
 * Each control edits its own parameter and copies the others through, so
 * choosing a type does not silently drop the status already applied. `page` is
 * the deliberate exception: a filter changes what the pages contain, so staying
 * on page 4 of a different result set is a way to land on an empty screen that
 * looks like "no records" rather than "you moved".
 *
 * ── Without JavaScript ──────────────────────────────────────────────────────
 *
 * It sits in a real `form` with `method="get"`, so a submit still filters
 * without any of this running. The router push is the enhancement, not the
 * mechanism.
 */
export function FilterSelect({
  label,
  name,
  value,
  options,
  allLabel = 'All',
  className,
}: FilterSelectProps) {
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const id = useId()

  function apply(next: string) {
    const params = new URLSearchParams(search?.toString() ?? '')
    if (next) params.set(name, next)
    else params.delete(name)
    // Any filter change invalidates the page number — see the note above.
    params.delete('page')
    const qs = params.toString()
    // Cast because Next's typed routes cannot know a URL assembled at runtime.
    // The value is not free text — it comes from the option list this control
    // was given, and the parameter name is fixed by the caller.
    router.push((qs ? `${pathname}?${qs}` : pathname) as Parameters<typeof router.push>[0])
  }

  return (
    <div className={cn('min-w-0', className)}>
      <label
        htmlFor={id}
        className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-xxm-gray-400"
      >
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          name={name}
          value={value ?? ''}
          onChange={(e) => apply(e.target.value)}
          className="w-full cursor-pointer appearance-none rounded-xl border border-xxm-gray-200 bg-white py-2 pl-3 pr-9 text-sm font-medium text-xxm-green-900 focus:outline-none focus:ring-2 focus:ring-xxm-green/25"
        >
          <option value="">{allLabel}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {/* Inline SVG rather than an icon import: this package is consumed by
            both apps and a chevron is not worth a dependency edge. */}
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          fill="none"
          className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-xxm-gray-400"
        >
          <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  )
}

/**
 * The row a set of `FilterSelect`s sits in.
 *
 * Two columns on a phone rather than one: these are short controls, and a
 * single column pushes the content they filter below the fold on a 360px
 * screen — which is the complaint the pills already had.
 */
export function FilterBar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <form
      method="get"
      className={cn(
        'grid grid-cols-2 gap-3 rounded-2xl border border-xxm-green/8 bg-white p-4 shadow-xxm-sm sm:flex sm:flex-wrap sm:items-end',
        className,
      )}
    >
      {children}
      {/* Only reachable without JavaScript, where the change handler cannot
          run. Hidden from everyone else rather than left as a button that
          repeats what already happened. */}
      <noscript>
        <button
          type="submit"
          className="rounded-xl bg-xxm-green px-4 py-2 text-sm font-semibold text-white"
        >
          Apply
        </button>
      </noscript>
    </form>
  )
}
