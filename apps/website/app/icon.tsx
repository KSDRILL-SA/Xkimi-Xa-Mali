import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #1B4332 0%, #052E16 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 900,
          fontSize: 16,
          color: '#D4AF37',
          fontFamily: 'system-ui, sans-serif',
          letterSpacing: '-0.5px',
        }}
      >
        X
      </div>
    ),
    { ...size }
  )
}
