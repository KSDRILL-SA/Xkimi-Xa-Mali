/**
 * Deriving the client's IP from request headers, once, for every app.
 *
 * This lives in the shared package because it is a security control rather than
 * a convenience. Rate limiters and audit records key on the value it returns, so
 * a header that the front door does not overwrite is not evidence of anything —
 * it is text the caller wrote. Believing one hands an attacker a fresh
 * rate-limit bucket per request, which disables brute-force protection without
 * anything appearing to be wrong.
 *
 * It was previously implemented three times over, in two apps, each preferring
 * `cf-connecting-ip` — a header that is authoritative behind Cloudflare and
 * entirely attacker-controlled anywhere else. One implementation means one place
 * to be right, and one place to change when what sits in front changes.
 */

export type TrustedProxy = 'vercel' | 'cloudflare' | 'none'

/** Minimal shape shared by `Headers` and Next's `ReadonlyHeaders`. */
export type HeaderReader = { get(name: string): string | null | undefined }

export function resolveTrustedProxy(value: string | undefined): TrustedProxy {
  if (value === 'cloudflare' || value === 'none' || value === 'vercel') return value
  // Unrecognised values fall back to the deployment target rather than to
  // "trust everything", so a typo cannot widen what is believed.
  return 'vercel'
}

/** First hop of a comma-separated forwarded-for chain: the originating client. */
function firstHop(value: string | null | undefined): string | undefined {
  return value?.split(',')[0]?.trim() || undefined
}

/**
 * The client's IP, or undefined when no header under our control carries it.
 *
 * Undefined is a real answer. Callers collapse it into a single shared bucket,
 * so unattributable traffic is limited together rather than each request being
 * handed its own allowance.
 */
export function clientIpFromHeaders(
  headers: HeaderReader,
  proxy: TrustedProxy = resolveTrustedProxy(process.env.TRUSTED_PROXY),
): string | undefined {
  if (proxy === 'cloudflare') {
    // Set by Cloudflare from the real connection; an inbound copy is replaced.
    return headers.get('cf-connecting-ip')?.trim() || undefined
  }

  if (proxy === 'vercel') {
    // Vercel sets both from the real connection and does not honour an inbound
    // value. x-vercel-forwarded-for is checked first because it is unambiguous.
    return (
      firstHop(headers.get('x-vercel-forwarded-for')) ??
      firstHop(headers.get('x-forwarded-for'))
    )
  }

  // Nothing declared in front, so nothing is normalising these headers and
  // there is no trustworthy client IP. Say so rather than believe the caller.
  return undefined
}
