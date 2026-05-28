import { cn } from '@/lib/utils'

interface XmmLogoProps {
  size?: number
  /* canonical prop */
  showWordmark?: boolean
  /* legacy alias — kept for backward compat */
  withText?: boolean
  /* 'default' = gold on dark green (most surfaces)
     'light'   = white tint (dark overlays)
     'mono'    = greyscale */
  variant?: 'default' | 'light' | 'mono'
  /* Tailwind text-colour class for the wordmark text.
     Defaults to text-white. Pass e.g. "text-xxm-green" for light bg. */
  textColor?: string
  className?: string
}

export function XmmLogo({
  size = 40,
  showWordmark,
  withText,
  variant = 'default',
  textColor = 'text-white',
  className,
}: XmmLogoProps) {
  const wordmark = showWordmark ?? withText ?? false

  const greenFill = variant === 'mono' ? '#444' : '#1B4332'
  const goldFill  = variant === 'mono' ? '#999' : '#D4AF37'
  const goldLight = variant === 'mono' ? '#bbb' : '#F0D060'
  const goldDark  = variant === 'mono' ? '#777' : '#A88828'
  const ring1     = variant === 'light' ? 'rgba(255,255,255,0.12)' : 'rgba(212,175,55,0.18)'
  const ring2     = variant === 'light' ? 'rgba(255,255,255,0.06)' : 'rgba(212,175,55,0.08)'

  return (
    <span className={cn('inline-flex items-center gap-2.5 shrink-0', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Xkimm Xa Mali logo"
        role="img"
      >
        <defs>
          <radialGradient id="xxm-logo-shine" cx="35%" cy="30%" r="65%" fx="35%" fy="30%">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.18)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <linearGradient id="xxm-x-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={goldLight} />
            <stop offset="50%"  stopColor={goldFill} />
            <stop offset="100%" stopColor={goldDark} />
          </linearGradient>
          <linearGradient id="xxm-m-grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor={goldLight} />
            <stop offset="100%" stopColor={goldFill} />
          </linearGradient>
        </defs>

        {/* orbit rings */}
        <circle cx="50" cy="50" r="47" stroke={ring1} strokeWidth="1" />
        <circle cx="50" cy="50" r="41" stroke={ring2} strokeWidth="0.5" />

        {/* main coin body */}
        <circle cx="50" cy="50" r="38" fill={greenFill} />

        {/* inner accent ring */}
        <circle cx="50" cy="50" r="35" fill="none" stroke={goldFill} strokeWidth="1.2" opacity="0.4" />

        {/* top sheen */}
        <circle cx="50" cy="50" r="38" fill="url(#xxm-logo-shine)" />

        {/* X monogram */}
        <text
          x="50" y="47"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="url(#xxm-x-grad)"
          fontSize="28"
          fontWeight="900"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="-1"
        >
          X
        </text>

        {/* XXM wordmark below X */}
        <text
          x="50" y="67"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="url(#xxm-m-grad)"
          fontSize="11"
          fontWeight="700"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="3"
          opacity="0.85"
        >
          XXM
        </text>

        {/* bottom accent line */}
        <line x1="34" y1="73" x2="66" y2="73" stroke={goldFill} strokeWidth="1" opacity="0.5" />

        {/* top sparkle */}
        <circle cx="50" cy="17" r="2.5" fill={goldFill} opacity="0.6" />
        <circle cx="50" cy="17" r="1.2" fill={goldLight} />
      </svg>

      {wordmark && (
        <span className={cn('flex flex-col leading-none', textColor)}>
          <span className="font-bold text-sm tracking-wide">Xkimm Xa Mali</span>
          <span className="text-[10px] opacity-50 tracking-widest uppercase mt-0.5">
            Contributing · Growing · Securing
          </span>
        </span>
      )}
    </span>
  )
}
