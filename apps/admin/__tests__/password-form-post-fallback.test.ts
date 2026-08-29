import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Every password-collecting form needs a `method="post"` fallback.
 *
 * See `apps/web/__tests__/password-form-post-fallback.test.ts` for the full
 * reasoning — this is the admin console's half of the same guard (PR #411
 * fixed both apps; this test only covers the one it lives in).
 */

const COMPONENTS_ROOT = resolve(__dirname, '../components')

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = resolve(dir, entry)
    if (statSync(full).isDirectory()) return tsxFiles(full)
    return full.endsWith('.tsx') ? [full] : []
  })
}

/** Strips comments so a comment mentioning `method="post"` can't satisfy a
 *  check for the real attribute once it's gone from the actual `<form>` —
 *  see the web app's copy of this test for how that was caught live. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const files = tsxFiles(COMPONENTS_ROOT).map((path) => ({
  path: path.slice(COMPONENTS_ROOT.length + 1).replace(/\\/g, '/'),
  source: readFileSync(path, 'utf8'),
}))

describe('every password field ships in a form with a POST fallback', () => {
  const passwordFieldFiles = files.filter((f) =>
    /autoComplete=["'](current|new)-password["']/.test(f.source),
  )

  it('found the password-collecting component(s) this test is meant to guard', () => {
    expect(passwordFieldFiles.length).toBeGreaterThanOrEqual(1)
  })

  it.each(passwordFieldFiles.map((f) => [f.path, code(f.source)] as const))(
    '%s has a <form> carrying method="post"',
    (_path, stripped) => {
      expect(stripped).toMatch(/<form\b[^>]*\bmethod="post"/)
    },
  )
})
