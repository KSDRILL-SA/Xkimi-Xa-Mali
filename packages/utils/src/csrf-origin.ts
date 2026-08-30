// Edge-safe CSRF origin checks for authenticated mutating requests.
//
// Shared rather than copied. This lived in the member app alone, and the admin
// console — which approves mandates, reverses transactions and suspends members
// — had no origin check at all. Copying it across would have reproduced the
// failure mode §9 of the operating manual names as recurring in this
// repository: a control applied to one app and not its sibling, with nothing to
// keep the two in step. One implementation, two importers.

export type CsrfRequest = {
  headers: Headers
  nextUrl: URL
}

type CsrfEnv = {
  nextAuthUrl?: string
  nodeEnv?: string
}

function parseOrigin(value: string): string | null {
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function addLocalhostLoopbackAliases(origins: Set<string>, origin: string): void {
  const parsed = parseOrigin(origin)
  if (!parsed) return

  const url = new URL(parsed)
  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return

  const alias = new URL(parsed)
  alias.hostname = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost'
  origins.add(alias.origin)
}

export function buildAllowedOrigins(req: CsrfRequest, env: CsrfEnv = {}): Set<string> {
  const origins = new Set<string>()

  // Same deployment — a browser tab on this host posting to this host is not CSRF.
  origins.add(req.nextUrl.origin)

  // The origin the *browser* actually used, which is not always what
  // `req.nextUrl.origin` reports.
  //
  // Behind a reverse proxy (Vercel, and any similar host), the request URL the
  // framework reconstructs is the internal one — it can carry an internal host
  // and port rather than the public domain the user typed. When that happens,
  // the real public origin is never added above, so the allow-list ends up
  // containing an origin no browser will ever send. Every state-changing
  // request then fails the check below and is refused as cross-origin: on the
  // member app that was a profile update returning "Invalid request origin",
  // and on the admin console — where the proxy applies this to *every*
  // mutating request because the console is built from server actions, not
  // API routes — it was broadcast and even signing out failing with
  // "something went wrong".
  //
  // `x-forwarded-host` is set by the proxy itself and reports the public host.
  // It is only trusted here because this runs behind one: a request that
  // reaches the app without passing through the proxy cannot set it in a way
  // that matters, since it would still have to match the Origin header the
  // browser sends, and an attacker controls neither in a cross-site POST.
  const forwardedHost = req.headers.get('x-forwarded-host')
  if (forwardedHost) {
    // Default to https rather than the request's own protocol: the internal
    // hop is frequently plain http even when the public connection is https,
    // and the browser's Origin header always carries the public scheme.
    const forwardedProto = req.headers.get('x-forwarded-proto') ?? 'https'
    const forwarded = parseOrigin(`${forwardedProto}://${forwardedHost}`)
    if (forwarded) origins.add(forwarded)
  }

  const nextAuthUrl = env.nextAuthUrl ?? process.env.NEXTAUTH_URL
  if (nextAuthUrl) {
    const configured = parseOrigin(nextAuthUrl)
    if (configured) origins.add(configured)
  }

  const nodeEnv = env.nodeEnv ?? process.env.NODE_ENV
  if (nodeEnv === 'development') {
    for (const origin of [...origins]) {
      addLocalhostLoopbackAliases(origins, origin)
    }
  }

  return origins
}

export function verifyCsrfOrigin(req: CsrfRequest, env: CsrfEnv = {}): boolean {
  const allowed = buildAllowedOrigins(req, env)

  const origin = req.headers.get('origin')
  if (origin) {
    const parsed = parseOrigin(origin)
    if (parsed && allowed.has(parsed)) return true
  }

  // Some same-origin navigations omit Origin; Referer is a safe fallback here.
  const referer = req.headers.get('referer')
  if (referer) {
    const parsed = parseOrigin(referer)
    if (parsed && allowed.has(parsed)) return true
  }

  return false
}
