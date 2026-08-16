import { siteEnv } from './env'

export type PublicStats = {
  members: number
  totalPooled: number
  monthsActive: number
}

/**
 * The Foundation's real figures, or nothing.
 *
 * These three numbers are measured. `members` is `COUNT(*) WHERE status =
 * 'ACTIVE'`, `totalPooled` is the sum of successful inflows, `monthsActive` runs
 * from the first contribution row. They live in the database, the member app
 * aggregates them behind `/api/v1/stats/public` with no PII and an hour of
 * cache, and this module's only job is to carry them to the page unchanged.
 *
 * It used to substitute a fallback when the fetch failed: `members` from the
 * founder count, the other two zeroed. That is the failure this file now exists
 * to prevent. The founder count and the active member count are different facts
 * that happen to be equal today — the day the collective reaches thirty members
 * and the member app is briefly unreachable, the public page states, in the same
 * typeface as three measured figures, that there are four. Nothing on the page
 * would mark it as a guess, because nothing about it looks like one.
 *
 * A number nobody measured must not be rendered beside numbers that were. So the
 * unavailable case returns `null`, and every caller is made to decide what to
 * show when the truth is not available — which is a decision about honesty and
 * belongs at the call site, not hidden in a default.
 */

/**
 * Trust the envelope only after checking it.
 *
 * This was `json.data as PublicStats`, which is not a check — it is a promise to
 * the compiler that the network told the truth. A cast cannot fail, so a drifted
 * payload, a null column or an error body shaped like a success would flow
 * straight through and render `undefined` or `NaN` to the public.
 *
 * Finite and non-negative, because the values are a count, a sum of rands and an
 * elapsed month count: `Infinity` and `-3` are not degraded versions of those,
 * they are evidence something upstream is wrong, and the honest response to that
 * is the same as an unreachable API.
 */
function parseStats(value: unknown): PublicStats | null {
  if (typeof value !== 'object' || value === null) return null

  const record = value as Record<string, unknown>
  const out = {} as PublicStats

  for (const key of ['members', 'totalPooled', 'monthsActive'] as const) {
    const n = record[key]
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return null
    out[key] = n
  }

  return out
}

/**
 * Say that the public page is showing no numbers, and why.
 *
 * This began as a bare `catch {}` with a comment. The failure it swallowed was
 * not a missing value — it was the site quietly telling every visitor something
 * untrue about the Foundation's money, for as long as the outage lasted, with
 * nothing anywhere disagreeing.
 *
 * `console.warn` rather than the observability package: this app deliberately
 * carries no server dependencies and holds no secrets, and one warn from a
 * server component reaches the platform log where an operator is already
 * looking.
 */
function reportUnavailable(reason: string, detail?: unknown): void {
  console.warn(
    `[stats] public stats unavailable (${reason}) — the site is rendering these ` +
      `figures as unavailable rather than substituting numbers. Visitors see no counts.`,
    detail ?? '',
  )
}

export async function getPublicStats(): Promise<PublicStats | null> {
  const webUrl = siteEnv.APP_URL

  try {
    const res = await fetch(`${webUrl}/api/v1/stats/public`, {
      next: { revalidate: 3600 },
      // A marketing page that blocks on a slow internal call is a marketing
      // page nobody waits for. Two seconds, then render without the figures.
      signal: AbortSignal.timeout(2000),
    })

    if (!res.ok) {
      reportUnavailable(`the member app answered ${res.status}`)
      return null
    }

    const json = await res.json()
    const stats = parseStats((json as { data?: unknown } | null)?.data)

    if (!stats) {
      // A 200 carrying the wrong shape is its own failure, and used to be
      // indistinguishable from a successful fetch of nothing.
      reportUnavailable('the response did not carry three finite, non-negative figures')
      return null
    }

    return stats
  } catch (err) {
    reportUnavailable(
      err instanceof Error && err.name === 'TimeoutError'
        ? 'the member app did not answer within 2s'
        : 'the member app could not be reached',
      err instanceof Error ? err.message : err,
    )
    return null
  }
}
