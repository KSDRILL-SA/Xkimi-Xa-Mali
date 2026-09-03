import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import path from 'path'

/**
 * A service that takes an `ip` must be called with one.
 *
 * `AdminContext.ip` exists for a single reason and its own comment says so:
 * "Caller IP for the audit trail." `requireAdmin` resolves it on every call, and
 * twelve services accept it and forward it to `writeAuditLog`. Six call sites
 * destructured `{ userId, roles }`, dropped it, and wrote audit rows with
 * `ipAddress = NULL`.
 *
 * Found on 2026-08-16 by driving the console and then reading the audit table,
 * rather than by reading the code. Three of the eight admin actions that had
 * ever been run recorded an IP and five did not — and the five were
 * `ADMIN_CONTRIBUTIONS_GENERATED`, `ADMIN_CONTRIBUTION_WAIVED`,
 * `ADMIN_PAYMENT_RECORDED`, `ADMIN_INVITATION_REVOKED` and
 * `ADMIN_MANDATE_APPROVED`: the money-touching ones. The compliance pack tells a
 * regulator this log records who did what and from where. It was recording
 * "where" only for the actions least likely to be asked about.
 *
 * Same shape as the broadcast defect — `requireAdmin` hands something back and
 * the caller discards it. `internal-admin-callers.test.ts` guards that shape
 * where the call crosses to the web app; this guards it where the call stays
 * inside this one, which is the half that had no guard and so is the half that
 * broke.
 *
 * **Why it checks the argument and not the destructuring.** An earlier version
 * required every `requireAdmin` call site to bind `ip`. That is the wrong rule:
 * a guard on a read-only page has no audit row to stamp, and binding an unused
 * variable to satisfy a test only moves the complaint to the linter. Keying on
 * the twelve services that actually accept an `ip` states the real obligation —
 * if a function asks for the caller's origin, give it.
 *
 * A source scan rather than a behavioural test, deliberately: the claim is about
 * every present and future call site, and mocking one action proves nothing
 * about the next one somebody writes.
 */

/** Services whose signature includes `ip?: string`. Kept in sync by the first case. */
const TAKES_IP = [
  'approveMandate',
  'correctMemberIdNumber',
  'generateContributions',
  'recordGoalOutcome',
  // Declares its `ip` inside an options object rather than positionally. The
  // obligation is the same — it forwards the caller's origin to the web app,
  // which writes the audit row — and the scan below reads the whole argument
  // list, so an object field counts exactly as a positional one does.
  'recordOfflinePaymentForMember',
  'recordPayment',
  'rejectGoal',
  'rejectMandate',
  'revokeInvitation',
  'setMemberRole',
  'setMemberStatus',
  'unlockMember',
  'waiveContribution',
] as const

const APP_ROOT = path.resolve(__dirname, '..')
const SERVICES = path.join(APP_ROOT, 'lib', 'services')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/** The argument list of a call, handling one level of nested parens. */
function argsOf(src: string, openParen: number): string {
  let depth = 0
  for (let i = openParen; i < src.length; i++) {
    if (src[i] === '(') depth++
    else if (src[i] === ')') {
      depth--
      if (depth === 0) return src.slice(openParen + 1, i)
    }
  }
  return ''
}

describe('services that accept an IP are given one', () => {
  it('the list matches what the services actually declare', () => {
    // Without this, adding a new `ip?: string` service silently escapes the
    // check below — the list would go stale and the suite would stay green.
    const declared: string[] = []
    for (const file of sourceFiles(SERVICES)) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/export async function (\w+)\s*\(/g)) {
        const args = argsOf(src, (m.index ?? 0) + m[0].length - 1)
        if (/\bip\?:\s*string/.test(args)) declared.push(m[1] as string)
      }
    }
    expect(declared.sort()).toEqual([...TAKES_IP].sort())
  })

  it('every call site passes it', () => {
    const offenders: string[] = []

    for (const file of sourceFiles(path.join(APP_ROOT, 'app'))) {
      const src = readFileSync(file, 'utf8')
      for (const name of TAKES_IP) {
        const call = new RegExp(`\\b(?:await\\s+)?${name}\\s*\\(`, 'g')
        for (const m of src.matchAll(call)) {
          const args = argsOf(src, (m.index ?? 0) + m[0].length - 1)
          if (!/\bip\b/.test(args)) {
            const line = src.slice(0, m.index).split('\n').length
            offenders.push(`${path.relative(APP_ROOT, file)}:${line} → ${name}()`)
          }
        }
      }
    }

    expect(offenders, `these drop the caller IP, so their audit rows say nothing about where the action came from:\n  ${offenders.join('\n  ')}`)
      .toEqual([])
  })
})
