# Authentication Flow

Registration, email verification, login, session validation, password reset, and route-tier enforcement. Registration is **invite-gated** (full flow: [05-invite-registration-flow.md](./05-invite-registration-flow.md)). Security model: [../security/01-security-architecture.md](../security/01-security-architecture.md).

---

## Account states

```mermaid
stateDiagram-v2
    [*] --> PENDING : invite-gated register<br/>verification email sent
    PENDING --> PENDING : email verified<br/>(awaiting admin activation)
    PENDING --> ACTIVE : admin activates account
    ACTIVE --> SUSPENDED : admin suspends
    SUSPENDED --> ACTIVE : admin reactivates
    note right of PENDING
        Login is blocked until ACTIVE.
        EMAIL_NOT_VERIFIED vs PENDING_ACTIVATION
        are surfaced as distinct messages.
    end note
```

## Login

```mermaid
sequenceDiagram
    participant B as Browser
    participant MW as Middleware
    participant NA as NextAuth authorize()
    participant DB as PostgreSQL

    B->>MW: POST sign-in (email + password)
    MW->>MW: rate limit 5 / 15 min / IP
    MW->>NA: forward
    NA->>DB: user by email (lowercased — case-insensitive)
    alt not found / wrong password
        NA-->>B: 401 AUTH_001 (no user enumeration)
    else status PENDING (unverified)
        NA-->>B: 401 EMAIL_NOT_VERIFIED
    else status PENDING (verified)
        NA-->>B: 401 PENDING_ACTIVATION
    else status SUSPENDED
        NA-->>B: 401 account suspended
    end
    NA->>NA: bcrypt.compare → sign JWT { id, email, roles }
    NA-->>B: Set-Cookie session (HTTP-only, Secure, SameSite) → /dashboard
```

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

## Route-tier enforcement (`middleware.ts`)

```mermaid
flowchart TD
    REQ["request"] --> L0{"L0 public<br/>allowlist?"}
    L0 -->|yes| PASS0["pass — no auth"]
    L0 -->|no| JWT{"valid JWT cookie?"}
    JWT -->|no| R401["401 / redirect to login"]
    JWT -->|yes| L2{"admin (L2) route?"}
    L2 -->|yes| ROLE{"ADMIN in claims?"}
    ROLE -->|no| R403["403 forbidden"]
    ROLE -->|yes| PASS2["admin handler"]
    L2 -->|no| PASS1["member (L1) handler"]
```

| Tier | Routes | Rule |
|---|---|---|
| **L0** Public | `/` · `/whatsapp` · `/auth/*` · `/api/v1/auth/*` · `health` · `stats/public` | No auth |
| **L1** Member | `/dashboard/*` · members · mandates · contributions · transactions · notifications · insights · inbox | Any valid session; queries scoped to `x-user-id` — never a client-supplied id |
| **L2** Admin | `/admin/*` · `/api/v1/admin/*` · goals (write) | ADMIN role in JWT |
| **L3** System | `/api/v1/webhooks/*` | HMAC only — session cookies rejected |
