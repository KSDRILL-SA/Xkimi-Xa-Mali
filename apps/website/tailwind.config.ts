import type { Config } from 'tailwindcss'
import { baseConfig } from '@xxm/config/tailwind'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  ...baseConfig,
  theme: {
    extend: {
      ...baseConfig.theme?.extend,
      backgroundImage: {
        'gold-shimmer': 'linear-gradient(90deg, #D4AF37 0%, #F0D060 25%, #D4AF37 50%, #A88828 75%, #D4AF37 100%)',
        'green-radial': 'radial-gradient(ellipse at center, #2C5F47 0%, #1B4332 50%, #052E16 100%)',
      },
      boxShadow: {
        ...baseConfig.theme?.extend?.boxShadow,
        'gold-lg': '0 8px 32px rgba(212,175,55,0.40)',
        'glass':   '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
      },
      animation: {
        ...baseConfig.theme?.extend?.animation,
        // Slower, more cinematic timings for the marketing site
        'fade-in':      'fade-in 0.6s ease-out both',
        'fade-in-up':   'fade-in-up 0.7s ease-out both',
        'fade-in-down': 'fade-in-down 0.6s ease-out both',
        'slide-left':   'slide-left 0.7s ease-out both',
        'slide-right':  'slide-right 0.7s ease-out both',
        'scale-in':     'scale-in 0.5s ease-out both',
        'shimmer':      'shimmer 2.4s linear infinite',
        'count-up':     'fade-in-up 0.8s ease-out both',
      },
    },
  },
}

export default config
