import Link from 'next/link'
import type { Route } from 'next'
import { ChevronRight } from 'lucide-react'

/**
 * The dashboard's section heading, so the two pages read as one product.
 *
 * The contributions page previously labelled its sections with a bare
 * uppercase caption — `HISTORY` in 10px grey — while every section on the
 * dashboard had an icon tile, a display-font title and a subtitle. Same app,
 * two typographic systems, and the weaker one on the page members open most.
 */
export function SectionHeading({
  icon: Icon,
  title,
  subtitle,
  href,
  hrefLabel,
}: {
  icon: React.ElementType
  title: string
  subtitle?: string
  href?: string
  hrefLabel?: string
}) {
  return (
    <div className="mb-3.5 flex items-end justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-xxm-green/10"
          aria-hidden
        >
          <Icon size={15} className="text-xxm-green" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-base font-extrabold leading-none tracking-tight text-xxm-green-900">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-[11px] text-xxm-gray-400">{subtitle}</p>}
        </div>
      </div>
      {href && (
        <Link
          href={href as Route}
          className="group inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-xxm-green transition-colors hover:text-xxm-canopy"
        >
          {hrefLabel ?? 'View all'}
          {/* A leaf with no descendants — the one shape a transform is always
              safe on. See `motion.ts`. */}
          <ChevronRight
            size={13}
            className="sm:transition-transform sm:group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      )}
    </div>
  )
}
