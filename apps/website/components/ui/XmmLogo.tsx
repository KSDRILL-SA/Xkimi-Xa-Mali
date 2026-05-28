import { cn } from '@/lib/utils'

interface XmmLogoProps {
  size?: number
  className?: string
  variant?: 'default' | 'mono' | 'light'
  showWordmark?: boolean
}

export function XmmLogo({
  size = 40,
  className,
  variant = 'default',
  showWordmark = false,
}: XmmLogoProps) {
  const ring1 = variant === 'light' ? 'rgba(255,255,255,0.12)' : 'rgba(212,175,55,0.15)'
  const ring2 = variant === 'light' ? 'rgba(255,255,255,0.06)' : 'rgba(212,175,55,0.07)'
  const greenFill = variant === 'mono' ? '#333' : '#1B4332'
  const goldFill = variant === 'mono' ? '#888' : '#D4AF37'
  const goldLight = variant === 'mono' ? '#aaa' : '#F0D060'
  const goldDark = variant === 'mono' ? '#666' : '#A88828'

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {/* ── Emblem ── */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        {/* outer orbit ring */}
        <svg
          viewBox="0 0 100 100"
          width={size}
          height={size}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="absolute inset-0"
        >
          {/* orbit rings */}
          <circle cx="50" cy="50" r="47" stroke={ring1} strokeWidth="1" />
          <circle cx="50" cy="50" r="41" stroke={ring2} strokeWidth="0.5" />

          {/* main coin body — deep green */}
          <circle cx="50" cy="50" r="38" fill={greenFill} />

          {/* inner sheen ring */}
          <circle cx="50" cy="50" r="35" fill="none" stroke={goldFill} strokeWidth="1.2" opacity="0.4" />

          {/* top gradient highlight */}
          <defs>
            <radialGradient id="logoGrad" cx="35%" cy="30%" r="65%" fx="35%" fy="30%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
            <linearGradient id="xGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={goldLight} />
              <stop offset="50%" stopColor={goldFill} />
              <stop offset="100%" stopColor={goldDark} />
            </linearGradient>
            <linearGradient id="mGrad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor={goldLight} />
              <stop offset="100%" stopColor={goldFill} />
            </linearGradient>
          </defs>

          <circle cx="50" cy="50" r="38" fill="url(#logoGrad)" />

          {/* "X" letter — bold, centered, offset up */}
          <text
            x="50"
            y="46"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="url(#xGrad)"
            fontSize="26"
            fontWeight="900"
            fontFamily="system-ui, -apple-system, sans-serif"
            letterSpacing="-1"
          >
            X
          </text>

          {/* "M" monogram — smaller, below X */}
          <text
            x="50"
            y="66"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="url(#mGrad)"
            fontSize="11"
            fontWeight="700"
            fontFamily="system-ui, -apple-system, sans-serif"
            letterSpacing="3"
            opacity="0.85"
          >
            XXM
          </text>

          {/* bottom gold accent line */}
          <line
            x1="34" y1="72" x2="66" y2="72"
            stroke={goldFill}
            strokeWidth="1"
            opacity="0.5"
          />

          {/* top sparkle dot */}
          <circle cx="50" cy="17" r="2.5" fill={goldFill} opacity="0.6" />
          <circle cx="50" cy="17" r="1.2" fill={goldLight} />
        </svg>
      </div>

      {/* ── Wordmark ── */}
      {showWordmark && (
        <div className="flex flex-col leading-none select-none">
          <span
            className="font-black tracking-tight text-white"
            style={{ fontSize: size * 0.38 }}
          >
            Xkimm Xa Mali
          </span>
          <span
            className="text-white/40 tracking-widest uppercase font-medium mt-0.5"
            style={{ fontSize: size * 0.17 }}
          >
            Contributing · Growing · Securing
          </span>
        </div>
      )}
    </div>
  )
}
