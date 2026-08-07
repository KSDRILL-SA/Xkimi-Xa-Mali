import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1B4332',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          <span
            style={{
              color: '#D4AF37',
              fontSize: 68,
              fontWeight: 700,
              lineHeight: 1,
              fontFamily: 'sans-serif',
            }}
          >
            X
          </span>
          <span
            style={{
              color: '#ffffff',
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: 3,
              fontFamily: 'sans-serif',
            }}
          >
            MALI
          </span>
        </div>
      </div>
    ),
    { width: 180, height: 180 },
  )
}
