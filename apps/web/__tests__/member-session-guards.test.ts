import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readdirSync, statSync } from 'node:fs'

/**
 * Every member page guards its session rather than asserting one.
 *
 * Ten pages did `if (!session?.user?.id) redirect('/login')`. Four did
 * `session!.user.id` — badges, community, goals and the goal detail page — plus
 * four dashboard sections.
 *
 * The middleware covers `/dashboard`, so none of it was reachable. What it
 * produced if the matcher ever stopped covering a route was a TypeError and a
 * 500 rather than a trip to the login page, on exactly the routes where a
 * member is least able to explain what went wrong.
 *
 * Two of these — goals and the goal detail page — were audited page by page
 * without this being caught, because the audits were reading authorization of
 * the data rather than the assertion above it. Hence a check that reads every
 * page at once.
 */

const MEMBER_ROOT = resolve(__dirname, '../app/(member)')

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = resolve(dir, entry)
    if (statSync(full).isDirectory()) return tsxFiles(full)
    return full.endsWith('.tsx') ? [full] : []
  })
}

const files = tsxFiles(MEMBER_ROOT).map((path) => ({
  path: path.slice(MEMBER_ROOT.length + 1).replace(/\\/g, '/'),
  source: readFileSync(path, 'utf8'),
}))

/** Code with comments stripped — these files explain what they no longer do. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('no member page asserts a session', () => {
  it('has no `session!` anywhere under (member)', () => {
    const offenders = files
      .filter((f) => code(f.source).includes('session!'))
      .map((f) => f.path)

    expect(offenders).toEqual([])
  })

  it('every file that reads a session either guards it or returns without one', () => {
    // A page redirects; a dashboard section returns null, because a section
    // renders inside SectionBoundary and Next's redirect() works by throwing.
    const readers = files.filter((f) => code(f.source).includes('await getSession()'))
    expect(readers.length).toBeGreaterThan(5)

    for (const f of readers) {
      const c = code(f.source)
      const guarded =
        c.includes("redirect('/login')") ||
        /if\s*\(!session\?\.user\?\.id\)\s*return null/.test(c)
      expect(guarded, `${f.path} reads a session without guarding it`).toBe(true)
    }
  })

  it('dashboard sections do not redirect, because the boundary would swallow it', () => {
    // Kept as a statement of the interaction rather than a style rule: a
    // section that redirects is caught by its own error boundary and vanishes.
    const sections = files.filter((f) => f.path.includes('_sections/'))
    expect(sections.length).toBeGreaterThan(0)

    for (const f of sections) {
      expect(code(f.source), f.path).not.toContain("redirect('/login')")
    }
  })
})
