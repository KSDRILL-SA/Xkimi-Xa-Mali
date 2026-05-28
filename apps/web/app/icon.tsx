import { ImageResponse } from 'next/og'

export const size = { width: 192, height: 192 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 192,
          height: 192,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1B4332',
          borderRadius: 40,
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
              fontSize: 72,
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
              fontSize: 20,
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
    { width: 192, height: 192 },
  )
}
