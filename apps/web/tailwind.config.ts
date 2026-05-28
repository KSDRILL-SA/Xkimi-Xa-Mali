import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'xxm-green': {
          DEFAULT: '#1B4332',
          50:  '#F0FDF4',
          100: '#DCFCE7',
          200: '#BBF7D0',
          300: '#86EFAC',
          400: '#4ADE80',
          500: '#22C55E',
          600: '#16A34A',
          700: '#15803D',
          800: '#166534',
          900: '#14532D',
          950: '#052E16',
        },
        'xxm-canopy': {
          DEFAULT: '#2C5F47',
          light: '#3A7A5C',
          dark:  '#1E4030',
        },
        'xxm-gold': {
          DEFAULT: '#D4AF37',
          50:   '#FEFCE8',
          100:  '#FEF9C3',
          200:  '#FEF08A',
          light: '#F0D060',
          dark:  '#A88828',
          deep:  '#8A6F20',
        },
        'xxm-champagne': {
          DEFAULT: '#F5F0E6',
          50:  '#FDFBF7',
          100: '#FAF6EE',
          200: '#F5F0E6',
          300: '#EDE4D2',
          400: '#DDD3BA',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      boxShadow: {
        'xxm-sm': '0 1px 3px rgba(27,67,50,0.08), 0 1px 2px rgba(27,67,50,0.04)',
        'xxm':    '0 4px 12px rgba(27,67,50,0.10), 0 2px 4px rgba(27,67,50,0.06)',
        'xxm-lg': '0 10px 30px rgba(27,67,50,0.14), 0 4px 10px rgba(27,67,50,0.08)',
        'gold-sm': '0 2px 8px rgba(212,175,55,0.20)',
        'gold':    '0 4px 16px rgba(212,175,55,0.30)',
      },
      borderRadius: {
        'xl': '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      animation: {
        'fade-in':      'fade-in 0.3s ease-out both',
        'fade-in-up':   'fade-in-up 0.4s ease-out both',
        'slide-in-right': 'slide-in-right 0.35s ease-out both',
        'shimmer':      'shimmer 1.6s infinite',
        'pulse-gold':   'pulse-gold 2s ease-in-out infinite',
        'scale-in':     'scale-in 0.2s ease-out both',
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
    },
  },
  plugins: [],
}

export default config
