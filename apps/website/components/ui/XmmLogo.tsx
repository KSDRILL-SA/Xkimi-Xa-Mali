import { cn } from '@/lib/utils'

interface XmmLogoProps {
  size?: number
  showWordmark?: boolean
  variant?: 'default' | 'light' | 'mono'
  className?: string
}

export function XmmLogo({
  size = 40,
  showWordmark = false,
  variant = 'default',
  className,
}: XmmLogoProps) {
  const gold      = variant === 'mono' ? '#999' : '#D4AF37'
  const goldLight = variant === 'mono' ? '#ccc' : '#F5D76E'
  const goldDark  = variant === 'mono' ? '#666' : '#8B6914'
  const goldMid   = variant === 'mono' ? '#aaa' : '#BF9B30'
  const green     = variant === 'mono' ? '#333' : '#1B4332'
  const canopy    = variant === 'mono' ? '#555' : '#2C5F47'

  const uid = `xmm-ws-${size}`

  return (
    <div className={cn('flex items-center gap-3', className)}>
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
          <linearGradient id={`${uid}-ring`} x1="25%" y1="0%" x2="75%" y2="100%">
            <stop offset="0%"   stopColor={goldLight} />
            <stop offset="40%"  stopColor={gold} />
            <stop offset="100%" stopColor={goldDark} />
          </linearGradient>
          <radialGradient id={`${uid}-disc`} cx="38%" cy="32%" r="68%">
            <stop offset="0%"   stopColor={canopy} stopOpacity="0.9" />
            <stop offset="100%" stopColor={green}  stopOpacity="1" />
          </radialGradient>
          <radialGradient id={`${uid}-sheen`} cx="30%" cy="28%" r="55%">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.14)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </radialGradient>
          <linearGradient id={`${uid}-arrow-gold`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={goldLight} />
            <stop offset="55%"  stopColor={gold} />
            <stop offset="100%" stopColor={goldMid} />
          </linearGradient>
          <linearGradient id={`${uid}-center-ring`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor={goldLight} />
            <stop offset="100%" stopColor={goldMid} />
          </linearGradient>
          <linearGradient id={`${uid}-bar`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor={goldLight} />
            <stop offset="100%" stopColor={gold} />
          </linearGradient>
        </defs>

        {/* Outer gold ring */}
        <circle cx="50" cy="50" r="49" fill={`url(#${uid}-ring)`} />
        <circle cx="50" cy="50" r="45" fill="none" stroke={goldDark} strokeWidth="0.6" opacity="0.5" />

        {/* Green disc */}
        <circle cx="50" cy="50" r="43" fill={`url(#${uid}-disc)`} />

        {/* Green arrow — behind */}
        <g transform="translate(50,50) rotate(45)">
          <polygon
            points="-30,0 -20,-8.5 -20,-3.5 20,-3.5 20,-8.5 30,0 20,8.5 20,3.5 -20,3.5 -20,8.5"
            fill={canopy}
            opacity="0.85"
          />
        </g>

        {/* Gold arrow — front */}
        <g transform="translate(50,50) rotate(-45)">
          <polygon
            points="-30,0 -20,-8.5 -20,-3.5 20,-3.5 20,-8.5 30,0 20,8.5 20,3.5 -20,3.5 -20,8.5"
            fill={`url(#${uid}-arrow-gold)`}
          />
          <polygon
            points="-30,0 -20,-8.5 -20,-6 20,-6 20,-8.5 30,0"
            fill={goldLight}
            opacity="0.22"
          />
        </g>

        {/* Bar chart */}
        <rect x="36.5" y="19"   width="4.2" height="8.5"  rx="1.2" fill={`url(#${uid}-bar)`} opacity="0.60" />
        <rect x="42.5" y="16"   width="4.2" height="11.5" rx="1.2" fill={`url(#${uid}-bar)`} opacity="0.75" />
        <rect x="48.5" y="12.5" width="4.2" height="15"   rx="1.2" fill={`url(#${uid}-bar)`} />
        <rect x="54.5" y="16.5" width="4.2" height="11"   rx="1.2" fill={`url(#${uid}-bar)`} opacity="0.70" />

        {/* Center medallion */}
        <circle cx="50" cy="50" r="14"   fill={green} />
        <circle cx="50" cy="50" r="13"   fill="none" stroke={`url(#${uid}-center-ring)`} strokeWidth="1.8" />
        <circle cx="50" cy="50" r="11.5" fill="none" stroke={goldLight} strokeWidth="0.4" opacity="0.3" />

        {/* R symbol */}
        <text
          x="50" y="55.5"
          textAnchor="middle"
          fill={gold}
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize="15"
          fontWeight="bold"
        >
          R
        </text>

        {/* Handshake arc */}
        <path
          d="M45.5 60 Q50 63.5 54.5 60"
          stroke={gold}
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
          opacity="0.6"
        />

        {/* Top sheen */}
        <circle cx="50" cy="50" r="43" fill={`url(#${uid}-sheen)`} />
      </svg>

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
