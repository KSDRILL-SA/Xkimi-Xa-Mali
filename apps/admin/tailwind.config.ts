import type { Config } from 'tailwindcss'
import { baseConfig } from '@xxm/config/tailwind'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  ...baseConfig,
}

export default config
