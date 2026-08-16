import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  // Mirrors the web and admin apps: the app tsconfig uses `jsx: "preserve"`
  // because Next does its own transform, and Vite 8 transforms with oxc — so
  // JSX has to be enabled here explicitly. An `esbuild` option is ignored.
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    environment: 'node',
    globals: true,
    // Each file in its own process. The reasoning is written out in the web
    // app's config: files that call `vi.resetModules()` and re-import pay the
    // full cold load every time, and on a four-core machine that is what
    // crosses a timeout. This app is small enough not to need it yet; it is set
    // now so the three apps behave the same way and nobody has to rediscover it.
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
