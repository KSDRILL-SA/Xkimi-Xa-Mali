import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Every password-collecting form needs a `method="post"` fallback.
 *
 * `onSubmit` always intercepts a real submit once React has hydrated, but a
 * click that lands before hydration finishes falls through to the browser's
 * native submit. A bare `<form>` with no `method` defaults to GET, which
 * puts the password straight into the URL, browser history, and any proxy
 * or server access log along the way. Found live (PR #411) by submitting
 * the instant a page painted rather than waiting for it to be interactive.
 *
 * This test is the regression guard called for in the platform audit's
 * security-hotfix verification (`docs/production-readiness/
 * 02-platform-architecture-audit.md`, §5.h) — a manual re-check today does
 * not stop a new password form from being added without the fallback next
 * month.
 */

const COMPONENTS_ROOT = resolve(__dirname, '../components')

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = resolve(dir, entry)
    if (statSync(full).isDirectory()) return tsxFiles(full)
    return full.endsWith('.tsx') ? [full] : []
  })
}

/** Code with comments stripped — a comment *mentioning* `method="post"` (to
 *  explain why it's there) must not let a check for the real attribute pass
 *  once the attribute itself is gone. Caught live: an earlier version of
 *  this test string-matched the raw source and kept passing after a
 *  deliberately-broken `<form>` had the attribute stripped, because the
 *  file's own explanatory comment above the form still contained the
 *  literal text `method="post"`. */
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

  it('found the password-collecting components this test is meant to guard', () => {
    // A change that renames or restructures every one of these away would
    // silently make this whole test vacuous — catch that, not just a
    // regression in the files it already knows about.
    expect(passwordFieldFiles.length).toBeGreaterThanOrEqual(5)
  })

  it.each(passwordFieldFiles.map((f) => [f.path, code(f.source)] as const))(
    '%s has a <form> carrying method="post"',
    (_path, stripped) => {
      // Requires the attribute to actually sit inside a <form ...> tag, not
      // merely appear anywhere in the file (a comment explaining the fix is
      // legitimate content in these files and must not satisfy this check).
      expect(stripped).toMatch(/<form\b[^>]*\bmethod="post"/)
    },
  )
})
