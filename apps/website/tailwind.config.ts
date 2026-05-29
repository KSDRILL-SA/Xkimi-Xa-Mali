import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
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
          50:   '#FEFCE8', 100:  '#FEF9C3', 200:  '#FEF08A',
          light: '#F0D060', dark:  '#A88828', deep:  '#8A6F20',
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
      },
      fontSize: {
        'display': ['4.5rem',   { lineHeight: '1.05', fontWeight: '900', letterSpacing: '-0.02em' }],
        'h1':      ['2.25rem',  { lineHeight: '1.15', fontWeight: '900', letterSpacing: '-0.01em' }],
        'h2':      ['1.875rem', { lineHeight: '1.2',  fontWeight: '800' }],
        'h3':      ['1.5rem',   { lineHeight: '1.3',  fontWeight: '700' }],
        'h4':      ['1.125rem', { lineHeight: '1.4',  fontWeight: '700' }],
        'body-lg': ['1.0625rem',{ lineHeight: '1.65' }],
        'body':    ['0.9375rem',{ lineHeight: '1.6'  }],
        'caption': ['0.8125rem',{ lineHeight: '1.45', fontWeight: '500' }],
        'label':   ['0.75rem',  { lineHeight: '1.4',  fontWeight: '600', letterSpacing: '0.04em' }],
      },
      letterSpacing: {
        'tightest': '-0.02em',
        'tighter':  '-0.01em',
        'normal':   '0em',
        'wide':     '0.04em',
        'widest':   '0.1em',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
      backgroundImage: {
        'gold-shimmer': 'linear-gradient(90deg, #D4AF37 0%, #F0D060 25%, #D4AF37 50%, #A88828 75%, #D4AF37 100%)',
        'green-radial': 'radial-gradient(ellipse at center, #2C5F47 0%, #1B4332 50%, #052E16 100%)',
      },
      borderRadius: {
        'soft': '6px',
        'card': '14px',
        'xl':   '12px',
        '2xl':  '16px',
        '3xl':  '20px',
      },
      transitionDuration: {
        'fast': '150ms',
        'slow': '350ms',
      },
      transitionTimingFunction: {
        'smooth': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'bounce': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      animation: {
        'fade-in':         'fade-in 0.6s ease-out both',
        'fade-in-up':      'fade-in-up 0.7s ease-out both',
        'fade-in-down':    'fade-in-down 0.6s ease-out both',
        'slide-left':      'slide-left 0.7s ease-out both',
        'slide-right':     'slide-right 0.7s ease-out both',
        'scale-in':        'scale-in 0.5s ease-out both',
        'float':           'float 6s ease-in-out infinite',
        'float-delayed':   'float 6s ease-in-out 2s infinite',
        'pulse-ring':      'pulse-ring 2.5s ease-in-out infinite',
        'shimmer':         'shimmer 2.4s linear infinite',
        'gold-glow':       'gold-glow 3s ease-in-out infinite',
        'scroll-bounce':   'scroll-bounce 2s ease-in-out infinite',
        'draw-line':       'draw-line 1.2s ease-out forwards',
        'count-up':        'fade-in-up 0.8s ease-out both',
        'nav-reveal':      'nav-reveal 0.5s ease-out both',
        'word-reveal':     'word-reveal 0.8s ease-out both',
        'orb-drift-1':     'orb-drift-1 18s ease-in-out infinite',
        'orb-drift-2':     'orb-drift-2 22s ease-in-out infinite',
        'orb-drift-3':     'orb-drift-3 14s ease-in-out infinite',
        'border-glow':     'border-glow 3s ease-in-out infinite',
        'rotate-slow':     'rotate-slow 20s linear infinite',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(24px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-down': {
          from: { opacity: '0', transform: 'translateY(-16px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-left': {
          from: { opacity: '0', transform: 'translateX(-40px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-right': {
          from: { opacity: '0', transform: 'translateX(40px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.88)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-12px)' },
        },
        'pulse-ring': {
          '0%':   { boxShadow: '0 0 0 0 rgba(212,175,55,0.4)' },
          '70%':  { boxShadow: '0 0 0 20px rgba(212,175,55,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(212,175,55,0)' },
        },
        'shimmer': {
          from: { backgroundPosition: '200% center' },
          to:   { backgroundPosition: '-200% center' },
        },
        'gold-glow': {
          '0%, 100%': { textShadow: '0 0 20px rgba(212,175,55,0.3)' },
          '50%':      { textShadow: '0 0 40px rgba(212,175,55,0.7), 0 0 80px rgba(212,175,55,0.3)' },
        },
        'scroll-bounce': {
          '0%, 100%': { transform: 'translateY(0)', opacity: '0.8' },
          '50%':      { transform: 'translateY(8px)', opacity: '0.3' },
        },
        'draw-line': {
          from: { strokeDashoffset: '1000' },
          to:   { strokeDashoffset: '0' },
        },
        'nav-reveal': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'word-reveal': {
          from: { opacity: '0', transform: 'translateY(100%)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'orb-drift-1': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%':      { transform: 'translate(40px, -60px) scale(1.1)' },
          '66%':      { transform: 'translate(-30px, 30px) scale(0.9)' },
        },
        'orb-drift-2': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%':      { transform: 'translate(-50px, 40px) scale(1.15)' },
          '66%':      { transform: 'translate(60px, -20px) scale(0.85)' },
        },
        'orb-drift-3': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%':      { transform: 'translate(20px, -40px) scale(1.2)' },
        },
        'border-glow': {
          '0%, 100%': { borderColor: 'rgba(212,175,55,0.3)' },
          '50%':      { borderColor: 'rgba(212,175,55,0.8)' },
        },
        'rotate-slow': {
          from: { transform: 'rotate(0deg)' },
          to:   { transform: 'rotate(360deg)' },
        },
      },
      boxShadow: {
        'xxm-sm':  '0 1px 3px rgba(27,67,50,0.08), 0 1px 2px rgba(27,67,50,0.04)',
        'xxm':     '0 4px 12px rgba(27,67,50,0.10), 0 2px 4px rgba(27,67,50,0.06)',
        'xxm-lg':  '0 10px 30px rgba(27,67,50,0.14), 0 4px 10px rgba(27,67,50,0.08)',
        'gold-sm': '0 2px 8px rgba(212,175,55,0.25)',
        'gold':    '0 4px 16px rgba(212,175,55,0.35)',
        'gold-lg': '0 8px 32px rgba(212,175,55,0.40)',
        'glass':   '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
      },
    },
  },
  plugins: [],
}

export default config
