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
    // Kept because it is measurably faster on this suite — roughly 47s against
    // 64s — and for no other reason. Read on before treating it as a fix for
    // anything.
    //
    // This was originally added on the theory that the long-standing flake in
    // `gateway-selection`, `env-netcash` and `health.route` was `process.env`
    // leaking between files sharing a worker thread. **That theory was wrong.**
    // The failures were finally captured on 2026-08-15 and every one of them
    // reads `Test timed out in 30000ms` — not a wrong value, no value at all.
    // Separate processes cannot fix a timeout, and this setting never did.
    //
    // The real cause was cost. Those files call `vi.resetModules()` and
    // re-import in a loop — nine times in `gateway-selection`, eleven in
    // `health.route` — and what they re-imported was heavy: the netcash adapter
    // pulls in `@/lib/netcash` and from there the SOAP client, the batch-file
    // builder, the method table and the retry helper; the health route pulls in
    // Next's server runtime. Nothing caches across a `resetModules()`. On four
    // cores, with the rest of the suite competing for them, that is what crossed
    // the 30s below.
    //
    // Fixed where it belonged, in those three files, by stubbing the weight that
    // was never under test — the adapters are only ever compared by identity,
    // and the route only ever calls `NextResponse.json`. They now run in 1.5s,
    // 1.4s and 2.7s, and the suite fell from 85s to about 35s.
    //
    // So: if a red run appears here again, measure before reaching for module
    // state. Twice that instinct produced a confident wrong answer, and both
    // times the evidence for it — clean standalone runs, no minutes consumed —
    // was a symptom of the real cause rather than a clue about it.
    pool: 'forks',
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
