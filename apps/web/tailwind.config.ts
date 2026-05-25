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
          50: '#F0FDF4',
          100: '#DCFCE7',
          500: '#22C55E',
          700: '#15803D',
          900: '#14532D',
        },
        'xxm-gold': {
          DEFAULT: '#D4AF37',
          light: '#F0D060',
          dark: '#A88828',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
