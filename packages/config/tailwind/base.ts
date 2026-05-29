import type { Config } from 'tailwindcss'

export const xxmColors = {
  'xxm-green': {
    DEFAULT: '#1B4332',
    50:  '#F0FDF4', 100: '#DCFCE7', 200: '#BBF7D0',
    300: '#86EFAC', 400: '#4ADE80', 500: '#22C55E',
    600: '#16A34A', 700: '#15803D', 800: '#166534',
    900: '#14532D', 950: '#052E16',
  },
  'xxm-canopy': {
    DEFAULT: '#2C5F47',
    light: '#3A7A5C',
    dark:  '#1E4030',
  },
  'xxm-gold': {
    DEFAULT: '#D4AF37',
    50:   '#FEFCE8', 100: '#FEF9C3', 200: '#FEF08A',
    light: '#F0D060', dark: '#A88828', deep: '#8A6F20',
  },
  'xxm-champagne': {
    DEFAULT: '#F5F0E6',
    50:  '#FDFBF7', 100: '#FAF6EE', 200: '#F5F0E6',
    300: '#EDE4D2', 400: '#DDD3BA',
  },
  'xxm-gray': {
    50:  '#F9FAFB', 100: '#F3F4F6', 200: '#E5E7EB',
    300: '#D1D5DB', 400: '#9CA3AF', 500: '#6B7280',
    600: '#4B5563', 700: '#374151', 800: '#1F2937',
    900: '#111827',
  },
} satisfies Config['theme']['colors']

export const xxmFontSize = {
  'display': ['4.5rem',   { lineHeight: '1.05', fontWeight: '900', letterSpacing: '-0.02em' }],
  'h1':      ['2.25rem',  { lineHeight: '1.15', fontWeight: '900', letterSpacing: '-0.01em' }],
  'h2':      ['1.875rem', { lineHeight: '1.2',  fontWeight: '800' }],
  'h3':      ['1.5rem',   { lineHeight: '1.3',  fontWeight: '700' }],
  'h4':      ['1.125rem', { lineHeight: '1.4',  fontWeight: '700' }],
  'body-lg': ['1.0625rem',{ lineHeight: '1.65' }],
  'body':    ['0.9375rem',{ lineHeight: '1.6'  }],
  'caption': ['0.8125rem',{ lineHeight: '1.45', fontWeight: '500' }],
  'label':   ['0.75rem',  { lineHeight: '1.4',  fontWeight: '600', letterSpacing: '0.04em' }],
} satisfies Config['theme']['fontSize']

export const xxmBoxShadow = {
  'xxm-sm': '0 1px 3px rgba(27,67,50,0.08), 0 1px 2px rgba(27,67,50,0.04)',
  'xxm':    '0 4px 12px rgba(27,67,50,0.10), 0 2px 4px rgba(27,67,50,0.06)',
  'xxm-lg': '0 10px 30px rgba(27,67,50,0.14), 0 4px 10px rgba(27,67,50,0.08)',
  'gold-sm': '0 2px 8px rgba(212,175,55,0.20)',
  'gold':    '0 4px 16px rgba(212,175,55,0.30)',
} satisfies Config['theme']['boxShadow']

export const xxmAnimations = {
  animation: {
    'fade-in':        'fade-in 0.3s ease-out both',
    'fade-in-up':     'fade-in-up 0.4s ease-out both',
    'slide-in-right': 'slide-in-right 0.35s ease-out both',
    'shimmer':        'shimmer 1.6s infinite',
    'pulse-gold':     'pulse-gold 2s ease-in-out infinite',
    'scale-in':       'scale-in 0.2s ease-out both',
    'count-up':       'fade-in-up 0.6s cubic-bezier(0.16,1,0.3,1) both',
  },
  keyframes: {
    'fade-in': {
      from: { opacity: '0' },
      to:   { opacity: '1' },
    },
    'fade-in-up': {
      from: { opacity: '0', transform: 'translateY(12px)' },
      to:   { opacity: '1', transform: 'translateY(0)' },
    },
    'slide-in-right': {
      from: { opacity: '0', transform: 'translateX(100%)' },
      to:   { opacity: '1', transform: 'translateX(0)' },
    },
    shimmer: {
      '0%':   { backgroundPosition: '200% 0' },
      '100%': { backgroundPosition: '-200% 0' },
    },
    'pulse-gold': {
      '0%, 100%': { opacity: '1' },
      '50%':      { opacity: '0.6' },
    },
    'scale-in': {
      from: { opacity: '0', transform: 'scale(0.92)' },
      to:   { opacity: '1', transform: 'scale(1)' },
    },
  },
}

export const baseConfig: Partial<Config> = {
  theme: {
    extend: {
      colors:      xxmColors,
      fontSize:    xxmFontSize,
      boxShadow:   xxmBoxShadow,
      ...xxmAnimations,
      letterSpacing: {
        tightest: '-0.02em',
        tighter:  '-0.01em',
        normal:   '0em',
        wide:     '0.04em',
        widest:   '0.1em',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      borderRadius: {
        soft: '6px',
        card: '14px',
        xl:   '12px',
        '2xl': '16px',
        '3xl': '20px',
      },
      transitionDuration: {
        fast: '150ms',
        slow: '350ms',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.16, 1, 0.3, 1)',
        bounce: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
}
