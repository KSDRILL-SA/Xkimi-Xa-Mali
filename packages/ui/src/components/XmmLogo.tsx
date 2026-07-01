import { cn } from '@xxm/utils'

interface XmmLogoProps {
  size?: number
  withText?: boolean
  showWordmark?: boolean
  textColor?: string
  variant?: 'default' | 'light' | 'mono'
  className?: string
}

export function XmmLogo({
  size = 40,
  withText,
  showWordmark,
  textColor = 'text-white',
  variant = 'default',
  className,
}: XmmLogoProps) {
  const wordmark = showWordmark ?? withText ?? false

  const gold      = variant === 'mono' ? '#999' : '#D4AF37'
  const goldLight = variant === 'mono' ? '#ccc' : '#F5D76E'
  const goldDark  = variant === 'mono' ? '#666' : '#8B6914'
  const goldMid   = variant === 'mono' ? '#aaa' : '#BF9B30'
  const green     = variant === 'mono' ? '#333' : '#1B4332'
  const canopy    = variant === 'mono' ? '#555' : '#2C5F47'

  const uid = `xmm-${size}` // unique enough for a single-page context

  return (
    <span className={cn('inline-flex items-center gap-2.5 shrink-0', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Xkimm Xa Mali Foundation logo"
        role="img"
      >
        <defs>
          {/* Gold ring — top-lit 3-D coin effect */}
          <linearGradient id={`${uid}-ring`} x1="25%" y1="0%" x2="75%" y2="100%">
            <stop offset="0%"   stopColor={goldLight} />
            <stop offset="40%"  stopColor={gold} />
            <stop offset="100%" stopColor={goldDark} />
          </linearGradient>

          {/* Green disc depth */}
          <radialGradient id={`${uid}-disc`} cx="38%" cy="32%" r="68%">
            <stop offset="0%"   stopColor={canopy} stopOpacity="0.9" />
            <stop offset="100%" stopColor={green}  stopOpacity="1" />
          </radialGradient>

          {/* Top-left sheen on disc */}
          <radialGradient id={`${uid}-sheen`} cx="30%" cy="28%" r="55%">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.14)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>

          {/* Gold arrow gradient */}
          <linearGradient id={`${uid}-arrow-gold`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={goldLight} />
            <stop offset="55%"  stopColor={gold} />
            <stop offset="100%" stopColor={goldMid} />
          </linearGradient>

          {/* Center circle ring gradient */}
          <linearGradient id={`${uid}-center-ring`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={goldLight} />
            <stop offset="100%" stopColor={goldMid} />
          </linearGradient>

          {/* Bar chart bar gradient */}
          <linearGradient id={`${uid}-bar`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor={goldLight} />
            <stop offset="100%" stopColor={gold} />
          </linearGradient>
        </defs>

        {/* ── Outer gold ring (coin rim) ───────────────────────────── */}
        <circle cx="50" cy="50" r="49" fill={`url(#${uid}-ring)`} />

        {/* Rim inner shadow line */}
        <circle cx="50" cy="50" r="45" fill="none" stroke={goldDark} strokeWidth="0.6" opacity="0.5" />

        {/* ── Inner green disc ─────────────────────────────────────── */}
        <circle cx="50" cy="50" r="43" fill={`url(#${uid}-disc)`} />

        {/* ── Green arrow — behind (NW ↔ SE direction) ─────────────── */}
        <g transform="translate(50,50) rotate(45)">
          <polygon
            points="-30,0 -20,-8.5 -20,-3.5 20,-3.5 20,-8.5 30,0 20,8.5 20,3.5 -20,3.5 -20,8.5"
            fill={canopy}
            opacity="0.85"
          />
        </g>

        {/* ── Gold arrow — front (SW ↔ NE direction) ───────────────── */}
        <g transform="translate(50,50) rotate(-45)">
          <polygon
            points="-30,0 -20,-8.5 -20,-3.5 20,-3.5 20,-8.5 30,0 20,8.5 20,3.5 -20,3.5 -20,8.5"
            fill={`url(#${uid}-arrow-gold)`}
          />
          {/* thin top edge highlight for 3-D lift */}
          <polygon
            points="-30,0 -20,-8.5 -20,-6 20,-6 20,-8.5 30,0"
            fill={goldLight}
            opacity="0.22"
          />
        </g>

        {/* ── Bar chart (growth indicator) — top section ───────────── */}
        <rect x="36.5" y="19"  width="4.2" height="8.5"  rx="1.2" fill={`url(#${uid}-bar)`} opacity="0.60" />
        <rect x="42.5" y="16"  width="4.2" height="11.5" rx="1.2" fill={`url(#${uid}-bar)`} opacity="0.75" />
        <rect x="48.5" y="12.5" width="4.2" height="15"  rx="1.2" fill={`url(#${uid}-bar)`} />
        <rect x="54.5" y="16.5" width="4.2" height="11"  rx="1.2" fill={`url(#${uid}-bar)`} opacity="0.70" />

        {/* ── Center medallion ─────────────────────────────────────── */}
        {/* dark fill */}
        <circle cx="50" cy="50" r="14" fill={green} />
        {/* gradient ring */}
        <circle cx="50" cy="50" r="13" fill="none" stroke={`url(#${uid}-center-ring)`} strokeWidth="1.8" />
        {/* inner subtle sheen */}
        <circle cx="50" cy="50" r="11.5" fill="none" stroke={goldLight} strokeWidth="0.4" opacity="0.3" />

        {/* R — Rand symbol, serif, gold */}
        <text
          x="50"
          y="55.5"
          textAnchor="middle"
          fill={gold}
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize="15"
          fontWeight="bold"
        >
          R
        </text>

        {/* Handshake arc below R */}
        <path
          d="M45.5 60 Q50 63.5 54.5 60"
          stroke={gold}
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
          opacity="0.6"
        />

        {/* ── Top-left sheen (light polish) ────────────────────────── */}
        <circle cx="50" cy="50" r="43" fill={`url(#${uid}-sheen)`} />
      </svg>

      {wordmark && (
        <span className={cn('flex flex-col leading-none', textColor)}>
          <span className="font-bold text-sm tracking-wide">Xkimm Xa Mali Foundation</span>
          <span className="text-[10px] opacity-50 tracking-widest uppercase mt-0.5">
            Contributing · Growing · Securing
          </span>
        </span>
      )}
    </span>
  )
}
