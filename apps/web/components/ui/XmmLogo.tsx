import { cn } from '@/lib/utils'

interface XmmLogoProps {
  size?: number
  withText?: boolean
  textColor?: string
  className?: string
}

export function XmmLogo({ size = 40, withText = false, textColor = 'text-white', className }: XmmLogoProps) {
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
        {/* Outer gold ring */}
        <circle cx="50" cy="50" r="49" fill="#D4AF37" />
        {/* Thin inner ring shadow */}
        <circle cx="50" cy="50" r="44.5" fill="none" stroke="#A88828" strokeWidth="0.8" opacity="0.6" />
        {/* Inner green disc */}
        <circle cx="50" cy="50" r="43" fill="#1B4332" />

        {/* Subtle radial highlight */}
        <circle cx="50" cy="50" r="43" fill="url(#radial-highlight)" />

        {/* Green double-headed arrow (NW ↔ SE) — rendered first (behind) */}
        <g transform="translate(50,50) rotate(45)">
          <polygon
            points="-29,0 -19,-9 -19,-3.5 19,-3.5 19,-9 29,0 19,9 19,3.5 -19,3.5 -19,9"
            fill="#2C5F47"
          />
        </g>

        {/* Gold double-headed arrow (SW ↔ NE) — rendered on top */}
        <g transform="translate(50,50) rotate(-45)">
          <polygon
            points="-29,0 -19,-9 -19,-3.5 19,-3.5 19,-9 29,0 19,9 19,3.5 -19,3.5 -19,9"
            fill="#D4AF37"
          />
        </g>

        {/* Bar chart growth icon — top section */}
        <rect x="37" y="18" width="4.5" height="9"  rx="1.2" fill="#D4AF37" opacity="0.65" />
        <rect x="43" y="15" width="4.5" height="12" rx="1.2" fill="#D4AF37" opacity="0.80" />
        <rect x="49" y="12" width="4.5" height="15" rx="1.2" fill="#D4AF37" />
        <rect x="55" y="16" width="4.5" height="11" rx="1.2" fill="#D4AF37" opacity="0.75" />

        {/* Center circle — covers arrow crossing for clean look */}
        <circle cx="50" cy="50" r="13.5" fill="#1B4332" />
        <circle cx="50" cy="50" r="12.5" fill="none" stroke="#D4AF37" strokeWidth="1.5" />

        {/* Rand R symbol */}
        <text
          x="50"
          y="55"
          textAnchor="middle"
          fill="#D4AF37"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize="14"
          fontWeight="bold"
        >
          R
        </text>

        {/* Handshake arc below R */}
        <path
          d="M45.5 59 Q50 62.5 54.5 59"
          stroke="#D4AF37"
          strokeWidth="1.3"
          fill="none"
          strokeLinecap="round"
          opacity="0.55"
        />

        <defs>
          <radialGradient id="radial-highlight" cx="35%" cy="35%" r="65%">
            <stop offset="0%"   stopColor="#2C5F47" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#1B4332" stopOpacity="0" />
          </radialGradient>
        </defs>
      </svg>

      {withText && (
        <span className={cn('flex flex-col leading-none', textColor)}>
          <span className="font-bold text-sm tracking-wide">Xkimm Xa Mali</span>
          <span className="text-[10px] opacity-55 tracking-widest uppercase mt-0.5">
            Contributing · Growing · Securing
          </span>
        </span>
      )}
    </span>
  )
}
