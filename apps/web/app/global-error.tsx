'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <div
          style={{
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            textAlign: 'center',
            backgroundColor: '#FBF8F1',
          }}
        >
          <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#1B4332', marginBottom: '0.5rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', maxWidth: '20rem', marginBottom: '2rem' }}>
            A critical error occurred. Please try reloading the page.
          </p>
          <button
            onClick={reset}
            style={{
              padding: '0.625rem 1.5rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              color: '#fff',
              backgroundColor: '#1B4332',
              border: 'none',
              borderRadius: '0.5rem',
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  )
}
