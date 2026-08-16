import { siteEnv } from './env'

export type PublicStats = {
  members: number
  totalPooled: number
  monthsActive: number
}

/**
 * What the site shows when the member app cannot be reached.
 *
 * Four members is a fact that does not depend on a fetch — there are four
 * founders. The other two are deliberately zero rather than a plausible guess:
 * this is published to the public, and an invented pooled total is a claim
 * about the Foundation's money that nobody could stand behind.
 *
 * Zero is honest, and it is also visibly wrong, which is the point of §
 * `reportFallback` below.
 */
export const FALLBACK_STATS: PublicStats = { members: 4, totalPooled: 0, monthsActive: 0 }

/**
 * Say that the public page is showing stand-in numbers.
 *
 * This used to be a bare `catch {}` with a comment. The failure it swallows is
 * not a missing value — it is the site telling every visitor the Foundation has
 * pooled R0, which reads as a collective that has never collected anything
 * rather than as a page that could not reach its own API. A month of that looks
 * exactly like a month of the truth, and nothing anywhere would have said
 * otherwise.
 *
 * `console.warn` rather than the observability package: this app deliberately
 * carries no server dependencies and holds no secrets, and one warn on a server
 * component reaches the platform log where an operator is already looking.
 */
function reportFallback(reason: string, detail?: unknown): void {
  console.warn(
    `[stats] public stats unavailable (${reason}) — the site is showing fallback numbers, ` +
      `including a pooled total of R0. This is visible to every visitor.`,
    detail ?? '',
  )
}

export async function getPublicStats(): Promise<PublicStats> {
  const webUrl = siteEnv.APP_URL

  try {
    const res = await fetch(`${webUrl}/api/v1/stats/public`, {
      next: { revalidate: 3600 },
      // A marketing page that blocks on a slow internal call is a marketing
      // page nobody waits for. Two seconds, then show something.
      signal: AbortSignal.timeout(2000),
    })

    if (!res.ok) {
      reportFallback(`the member app answered ${res.status}`)
      return FALLBACK_STATS
    }

    const json = await res.json()
    if (!json?.data) {
      // A 200 with the wrong shape is its own failure and used to be
      // indistinguishable from a successful fetch of nothing.
      reportFallback('the response had no `data` envelope')
      return FALLBACK_STATS
    }

    return json.data as PublicStats
  } catch (err) {
    reportFallback(
      err instanceof Error && err.name === 'TimeoutError'
        ? 'the member app did not answer within 2s'
        : 'the member app could not be reached',
      err instanceof Error ? err.message : err,
    )
    return FALLBACK_STATS
  }
}
