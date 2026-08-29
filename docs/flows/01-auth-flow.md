# Authentication Flow

Registration, email verification, login, session validation, password reset, and route-tier enforcement. Registration is **invite-gated** (full flow: [05-invite-registration-flow.md](./05-invite-registration-flow.md)). Security model: [../security/01-security-architecture.md](../security/01-security-architecture.md).

> **Updated 2026-08-30 — this doc previously described one app's middleware.**
> `apps/web` and `apps/admin` are separate Vercel deployments, each with its
> own NextAuth config and its own route-protection file — and in Next.js 16
> that file is named `proxy.ts`, not `middleware.ts` (a breaking rename from
> the version most training data reflects). See
> [../architecture/01-system-context.md](../architecture/01-system-context.md)
> for the 3-app boundary.

---

## Account states

There are **four** states, not three — `RESIGNED` (a member who chose to
leave; history stays, future collections stop) is easy to miss because it
never appears in the login-rejection flow below: a resigned member can
**still sign in**. Only certain writes are refused for them (see
"Membership standing" further down).

```mermaid
stateDiagram-v2
    [*] --> PENDING : invite-gated register<br/>verification email sent
    PENDING --> PENDING : email verified<br/>(awaiting admin activation)
    PENDING --> ACTIVE : admin activates account
    ACTIVE --> SUSPENDED : admin suspends
    SUSPENDED --> ACTIVE : admin reactivates
    ACTIVE --> RESIGNED : member chooses to leave<br/>(POST /api/v1/members/me/leave)
    note right of PENDING
        Login is blocked until ACTIVE.
        EMAIL_NOT_VERIFIED vs PENDING_ACTIVATION
        are surfaced as distinct messages.
    end note
    note right of RESIGNED
        Login still succeeds. History is kept.
        Contribution-collection and every
        state-changing write are refused —
        enforced in proxy.ts, not per-service.
    end note
```

## Login

Rate limiting happens **inside** the `authorize()` callback
(`assertLoginAllowed(ip)` in `lib/auth.ts`), not as a separate middleware
step before it — the two used to be drawn as sequential stages; in the real
code they're the same function call.

```mermaid
sequenceDiagram
    participant B as Browser
    participant NA as NextAuth authorize()
    participant DB as PostgreSQL

    B->>NA: POST sign-in (email + password)
    NA->>NA: rate limit 10 / 5 min / IP (Upstash sliding window)
    NA->>DB: user by email (lowercased — case-insensitive)
    Note over NA,DB: bcrypt.compare always runs, even for a<br/>nonexistent user (against a decoy hash) —<br/>closes a timing side-channel for email enumeration
    alt not found / wrong password
        NA-->>B: 401 (generic — no user enumeration)
    else status PENDING (unverified)
        NA-->>B: 401 EMAIL_NOT_VERIFIED
    else status PENDING (verified)
        NA-->>B: 401 PENDING_ACTIVATION
    else status SUSPENDED
        NA-->>B: 401 account suspended
    else status ACTIVE or RESIGNED
        NA->>NA: sign JWT { id, roles, roleVersion, status }
        NA-->>B: Set-Cookie session (HTTP-only, Secure, SameSite) → /dashboard
    end
```

`apps/admin`'s own `authorize()` in `apps/admin/lib/auth.ts` runs the
identical shape — same decoy-hash timing defence, same lockout counter —
with one addition: it rejects at this exact point if the account does not
hold the `ADMIN` role, before a session is ever issued. A member-only
account gets the same generic 401 as a wrong password, not a hint that the
account exists.

## Email verification & password reset

Both use the same pattern: a random token is emailed in plaintext; only its **SHA-256 hash** is stored. On submit, the hash is recomputed and compared (constant-time); success sets `usedAt` (one-time) inside a transaction.

```mermaid
sequenceDiagram
    participant U as User
    participant API as Auth API
    participant DB as PostgreSQL
    participant M as Resend

    Note over U,M: Forgot password (never reveals if email exists)
    U->>API: forgot-password { email } (rate limit 5/15min)
    API->>DB: if user exists → INSERT reset token (hash, 1h expiry)
    API->>M: email link with plaintext token
    API-->>U: 200 "if it exists, you'll get a link"

    Note over U,M: Reset / verify
    U->>API: submit { token, newPassword }
    API->>DB: match SHA-256(token), not expired, unused
    API->>DB: tx — update password (bcrypt 12) + set usedAt
    API-->>U: 200 → login
```

---

## Route-tier enforcement (`apps/web/proxy.ts`)

There is no `/admin/*` UI tier inside `apps/web` — the admin console is a
separate app (`apps/admin`) with its own `proxy.ts`. What `apps/web`'s
proxy actually gates is its own `/api/v1/admin/*` **API** routes, reached
two ways: a real admin's session (checked the same as any other route,
plus an `ADMIN` role check), or a **trusted server-to-server call from
`apps/admin` itself**, authenticated by a shared `ADMIN_API_SECRET` header
compared in constant time — not a session at all.

```mermaid
flowchart TD
    REQ["request to apps/web"] --> ALWAYS{"health / webhooks /<br/>NextAuth internals?"}
    ALWAYS -->|yes| PASS0["pass — self-verifying or public"]
    ALWAYS -->|no| PUB{"public page or<br/>public API allowlist?"}
    PUB -->|yes| PASS1["pass, no session required"]
    PUB -->|no| ADMINROUTE{"/api/v1/admin/* ?"}
    ADMINROUTE -->|yes| SECRET{"x-admin-secret header<br/>matches ADMIN_API_SECRET?<br/>(constant-time compare)"}
    SECRET -->|yes| PASSTRUST["pass — trusted call from apps/admin"]
    SECRET -->|no| SESS{"valid session?"}
    ADMINROUTE -->|no| SESS
    SESS -->|no| R401["401 (API) / redirect to /login (page)"]
    SESS -->|yes| ROLEV{"role version stale?<br/>(Redis, live revocation)"}
    ROLEV -->|yes| REAUTH["401 / redirect, reason=session_expired"]
    ROLEV -->|no| STANDING{"resigned member,<br/>state-changing write?"}
    STANDING -->|yes| R403A["403 SYS_008"]
    STANDING -->|no| CSRF{"mutating method?<br/>origin header checked"}
    CSRF -->|invalid| R403B["403 SYS_007"]
    CSRF -->|ok/GET| ADMINCHECK{"/api/v1/admin/* and<br/>no valid trusted secret?"}
    ADMINCHECK -->|ADMIN not in roles| R403C["403 SYS_003"]
    ADMINCHECK -->|ok| PASS2["handler"]
```

`apps/admin`'s own `proxy.ts` is much shorter: it only has to protect one
app's worth of pages behind a session that carries the `ADMIN` role — it
has no public-API allowlist, no trusted-secret bypass (it's the caller of
that mechanism, not the receiver), and no membership-standing check (an
admin is never "resigned" out of the console, only suspended or demoted).

| Concern | Where it's actually enforced |
|---|---|
| Public pages/APIs | `apps/web/proxy.ts` — explicit allowlist, not a route prefix |
| Any-valid-session pages | `apps/web/proxy.ts` — `!session` check; queries themselves are scoped to `session.user.id` via `assertCanAccess`, never a client-supplied id |
| `apps/web`'s admin API | `apps/web/proxy.ts` — trusted-secret OR `ADMIN` role in session, both checked here |
| Admin console UI | `apps/admin/proxy.ts` — session + `ADMIN` role, separately, plus `requireAdmin()` re-checking role live on every server action |
| Webhooks | Both apps' `WEBHOOK_PREFIX` allowlist — HMAC/signing-key verified inside the handler itself, session cookies never consulted |
| **Live role revocation** | Redis-cached `roleVersion`, seeded at login, bumped on any role/status change; a stale token forces re-authentication mid-session rather than waiting for JWT expiry — this is what makes suspending a member or demoting an admin take effect immediately instead of up to 24h later |
| **Resigned-member write block** | `refuseForStanding()` in `apps/web/proxy.ts` — reads are untouched, only state-changing calls are refused, so a departed member keeps visibility into their own history |
| **CSRF** | Origin-header check on every mutating method against authenticated API routes (`verifyCsrfOrigin`) |
| **CSP** | A fresh nonce generated per request, threaded onto both the request and response headers — the previous version of this policy shipped `'unsafe-inline'` on scripts, which made the CSP decorative against XSS |
