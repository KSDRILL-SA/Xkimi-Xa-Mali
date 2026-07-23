import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // The app tsconfig sets `jsx: "preserve"` because Next does its own JSX
  // transform. Vite honours that and then cannot parse the .tsx PDF templates
  // pulled in by the report suite, so transform JSX explicitly here.
  // Vite 8 transforms with oxc, so this must be an `oxc` option — an `esbuild`
  // one is silently ignored.
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    environment: 'node',
    globals: true,
    // Route suites dynamically import Next handlers, which pulls in the Prisma
    // client and the whole handler chain on first use. That cold load alone can
    // exceed the 5s default and is charged to whichever test imports first.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
