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
    // Each test file gets its own process, and this is a correctness setting
    // rather than a performance one.
    //
    // The default `threads` pool runs files in worker threads that share a
    // single `process.env`. Vitest's own module isolation does not extend to it
    // — a worker is reused across files, so a file that stubs an environment
    // variable and a file that reads one at import time are in the same room.
    // The suites that have ever flaked here are exactly the suites that do both:
    // `gateway-selection`, `env-netcash`, `health.route`, `whatsapp.preferences`
    // and `netcash-soap`, all of which call `vi.resetModules()` and re-import a
    // module whose behaviour is decided by the environment at load.
    //
    // `gateway-selection` already carries a long comment about an earlier
    // attempt at this, which moved the file from replacing `process.env` to
    // `vi.stubEnv`. That removed one way for the leak to happen and left the
    // shared object in place. Separate processes cannot share `process.env` at
    // all, which closes the class rather than another instance of it.
    //
    // It is also faster on this suite — roughly 47s against 64s — because these
    // tests spend their time on cold module loads rather than on CPU, and forks
    // parallelise that better than threads do here.
    //
    // **Status as at 2026-08-15.** `gateway-selection` and `health.route` were
    // still recorded as failing about one full run in six after this change, and
    // that note is now doubtful. Twelve consecutive full runs of this suite
    // passed with nothing else on the machine. The one failure seen recently
    // happened while two Next dev servers were compiling alongside the tests,
    // which points at contention against the 30s timeouts below rather than at
    // state leaking between files — and forks with the default isolation give
    // each file its own process, so the `process.env` leak this comment
    // describes should not be reachable any more.
    //
    // Left as it is, because the reasoning above is sound on its own terms and
    // nothing was reproduced to justify changing it. Recorded so the next person
    // to see a red run measures before assuming this is the same old ghost.
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
