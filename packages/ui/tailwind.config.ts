import type { Config } from 'tailwindcss'
import { baseConfig } from '@xxm/config/tailwind'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  ...baseConfig,
}

export default config
