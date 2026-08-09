import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Who could read a member's statement.
 *
 * The statement was rendered to a PDF, uploaded to Vercel Blob with
 * `access: 'public'` and `addRandomSuffix: false` at the path
 * `statements/<userId>/<year>-<month>.pdf`, and this route redirected the
 * member's browser to it.
 *
 *  - the URL was unauthenticated — whoever held it could fetch the document
 *  - it was permanent, and `getDownloadUrl` only adds a download disposition,
 *    so calling its result `signedUrl` was wrong in both words
 *  - the path was entirely derivable. With no random suffix, a member id yields
 *    every statement that member has ever generated, and the store hostname is
 *    already public in the CSP
 *
 * A financial document listing contribution history and a masked account number
 * was one guessed cuid away from anybody, with no session, no rate limit and no
 * audit trail.
 */

/**
 * Source with comments removed.
 *
 * These files explain in prose what they no longer do, so a naive search finds
 * the very strings the assertions forbid. What matters is whether the code does
 * it, not whether the comment names it.
 */
function code(relative: string): string {
  return readFileSync(resolve(__dirname, relative), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const route = code('../app/api/v1/transactions/statement/route.ts')
const service = code('../services/report.service.ts')

describe('how a statement reaches the member', () => {
  it('streams through the route rather than redirecting to storage', () => {
    expect(route).toContain('generateMemberStatementPdf')
    expect(route).not.toContain('NextResponse.redirect')
  })

  it('has no path that hands out a storage URL', () => {
    expect(route).not.toContain('signedUrl')
    expect(route).not.toContain('generateMemberStatement(')
  })

  it('keeps every fetch behind the session and the limiter', () => {
    // Both already existed; the redirect simply left them behind after the
    // first request, because the URL kept working without them.
    const beforeRender = route.slice(0, route.indexOf('await generateMemberStatementPdf'))
    expect(beforeRender).toContain('await auth()')
    expect(beforeRender).toContain('statementRatelimit.limit')
  })

  it('honours ?userId= only for an admin', () => {
    expect(route).toContain("roles.includes('ADMIN') && searchParams.get('userId')")
  })

  it('tells caches this belongs to one person', () => {
    expect(route).toContain("'private, no-store'")
  })
})

describe('the uploader is gone, not merely unused', () => {
  it('no longer exists to be called', () => {
    // A helper whose job is "put this member's statement somewhere the public
    // can read it" has no safe use, and leaving it exported is an invitation.
    expect(service).not.toContain('export async function generateMemberStatement(')
  })

  it('no longer uploads anything to a public path under statements/', () => {
    expect(service).not.toContain('statements/${userId}')
    const publicUploads = service.match(/access: 'public'/g) ?? []
    expect(publicUploads).toHaveLength(0)
  })

  it('records why, so it is not re-added as a convenience', () => {
    // Reads the file with comments intact — this is the one assertion that is
    // about the explanation rather than the code.
    const withComments = readFileSync(
      resolve(__dirname, '../services/report.service.ts'),
      'utf8',
    )
    expect(withComments).toMatch(/derivable from a member id/i)
  })
})
