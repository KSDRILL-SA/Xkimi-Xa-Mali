import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // Mirror the web app: the app tsconfig uses `jsx: "preserve"`, and Vite 8
  // transforms with oxc, so JSX must be enabled via the `oxc` option.
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
