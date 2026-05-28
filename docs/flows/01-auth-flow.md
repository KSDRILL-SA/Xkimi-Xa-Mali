# Authentication Flow

| | |
|---|---|
| **Purpose** | Full sequence diagrams for every auth flow — registration, email verification, login, session, password reset, and logout |
| **Modules** | M02 Auth System · M11a Invite and Access Control (patches registration) |
| **Related Docs** | [../security/01-security-architecture.md](../security/01-security-architecture.md) · [05-invite-registration-flow.md](./05-invite-registration-flow.md) · [../database/01-erd.md](../database/01-erd.md) |

---

## Diagram 1 — Registration Flow (Current — Open Registration)

> Pre-M11a: any person with a valid SA ID and phone can register. M11a closes this with invite codes.

```mermaid
sequenceDiagram
    participant B as Browser
    participant API as POST /api/v1/auth/register
    participant SVC as auth.service.ts
    participant DB as PostgreSQL
    participant EMAIL as Resend

    B->>API: POST email, phone, idNumber, firstName, lastName, password
    API->>API: Zod schema validation\nSA ID Luhn check\nSA phone format check\nPassword min 8 chars
    alt Validation fails
        API-->>B: 400 VAL_001 field errors
    end
    API->>SVC: registerUser(params)
    SVC->>DB: Check users.email unique
    alt Email already registered
        SVC-->>API: ConflictError
        API-->>B: 409 AUTH_003 email in use
    end
    SVC->>SVC: bcrypt.hash(password, 12)
    SVC->>SVC: encrypt(idNumber) AES-256-GCM
    SVC->>DB: BEGIN TRANSACTION
    SVC->>DB: INSERT users (status PENDING)
    SVC->>DB: INSERT user_roles (MEMBER role)
    SVC->>DB: INSERT notification_preferences (all true)
    SVC->>DB: INSERT email_verification_token (24h expiry)
    SVC->>DB: COMMIT
    SVC->>EMAIL: sendVerificationEmail(email, token)
    API-->>B: 201 success — check your email
```

---

## Diagram 2 — Email Verification Flow

```mermaid
sequenceDiagram
    participant EMAIL_CLIENT as Email Link Click
    participant PAGE as /auth/verify-email?token=...
    participant API as POST /api/v1/auth/verify-email
    participant SVC as auth.service.ts
    participant DB as PostgreSQL

    EMAIL_CLIENT->>PAGE: User clicks link in email
    PAGE->>API: POST { token }
    API->>SVC: verifyEmail(token)
    SVC->>SVC: sha256(token) to get hash
    SVC->>DB: SELECT email_verification_tokens WHERE tokenHash = hash
    alt Token not found
        SVC-->>API: NotFoundError
        API-->>PAGE: 400 AUTH_007 invalid token
    end
    alt Token expired (expiresAt < now)
        SVC-->>API: ExpiredError
        API-->>PAGE: 400 AUTH_008 token expired
    end
    alt Token already used (usedAt not null)
        SVC-->>API: UsedError
        API-->>PAGE: 400 AUTH_009 token already used
    end
    SVC->>DB: BEGIN TRANSACTION
    SVC->>DB: UPDATE users SET status = ACTIVE, emailVerified = now()
    SVC->>DB: UPDATE email_verification_tokens SET usedAt = now()
    SVC->>DB: COMMIT
    API-->>PAGE: 200 success
    PAGE-->>EMAIL_CLIENT: Redirect to /auth/login
```

---

## Diagram 3 — Login Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant MW as Middleware
    participant NEXTAUTH as NextAuth POST /api/auth/signin
    participant DB as PostgreSQL
    participant REDIS as Upstash Redis

    B->>MW: POST /api/auth/signin credentials
    MW->>REDIS: Rate limit check 5 per 15 min per IP
    alt Rate limit exceeded
        MW-->>B: 429 SYS_005 too many requests
    end
    MW->>NEXTAUTH: Forward request
    NEXTAUTH->>NEXTAUTH: NextAuth Credentials provider authorize()
    NEXTAUTH->>DB: SELECT users WHERE email = submitted_email
    alt User not found
        NEXTAUTH-->>B: 401 AUTH_001 invalid credentials\nNo user enumeration — same message
    end
    alt User status is PENDING
        NEXTAUTH-->>B: 401 AUTH_002 email not verified
    end
    alt User status is SUSPENDED
        NEXTAUTH-->>B: 401 AUTH_006 account suspended
    end
    NEXTAUTH->>NEXTAUTH: bcrypt.compare(password, hash)
    alt Password does not match
        NEXTAUTH-->>B: 401 AUTH_001 invalid credentials
    end
    NEXTAUTH->>NEXTAUTH: Build JWT payload\n{ id, email, roles, iat, exp }
    NEXTAUTH->>NEXTAUTH: Sign JWT with NEXTAUTH_SECRET
    NEXTAUTH-->>B: Set-Cookie: session token\nHTTP-only, Secure, SameSite=Lax\nRedirect to /dashboard
```

---

## Diagram 4 — Authenticated Request Flow (Session Validation)

```mermaid
sequenceDiagram
    participant B as Browser
    participant MW as Middleware
    participant API as Protected API Route

    B->>MW: Request with session cookie
    MW->>MW: Extract JWT from cookie
    alt No cookie present
        MW-->>B: 401 SYS_001 authentication required\nRedirect to /auth/login for page requests
    end
    MW->>MW: Verify JWT signature with NEXTAUTH_SECRET
    alt JWT invalid or expired
        MW-->>B: 401 SYS_001 session expired\nRedirect to /auth/login
    end
    MW->>MW: Decode payload { id, email, roles }
    MW->>MW: Check route tier\nL1 requires any valid session\nL2 requires ADMIN role in roles array
    alt ADMIN route but no ADMIN role
        MW-->>B: 403 SYS_003 forbidden
    end
    MW->>API: Forward request with session context\nheaders: x-user-id, x-user-roles
    API->>API: Use session context for DB queries\nNever trust client-supplied userId
    API-->>B: 200 with response data
```

---

## Diagram 5 — Password Reset Flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant API1 as POST /api/v1/auth/forgot-password
    participant API2 as POST /api/v1/auth/reset-password
    participant SVC as auth.service.ts
    participant DB as PostgreSQL
    participant EMAIL as Resend
    participant REDIS as Upstash Redis

    Note over B,REDIS: Step 1 — Request reset link

    B->>API1: POST { email }
    API1->>REDIS: Rate limit check 3 per hour per IP
    SVC->>DB: SELECT users WHERE email = submitted_email
    Note over SVC: No user enumeration:\nAlways return 200 regardless\nof whether email exists
    alt User exists
        SVC->>SVC: crypto.randomBytes(32) — plaintext token
        SVC->>SVC: sha256(token) — stored hash
        SVC->>DB: INSERT password_reset_tokens\ntokenHash, expiresAt now + 1 hour
        SVC->>EMAIL: Send reset email with plaintext token in link
    end
    API1-->>B: 200 if email exists you will receive a link

    Note over B,REDIS: Step 2 — Submit new password

    B->>API2: POST { token, newPassword }
    API2->>SVC: resetPassword(token, newPassword)
    SVC->>SVC: sha256(token)
    SVC->>DB: SELECT password_reset_tokens WHERE tokenHash = hash
    alt Token not found or expired or used
        SVC-->>API2: Error
        API2-->>B: 400 AUTH_010 invalid or expired token
    end
    SVC->>SVC: bcrypt.hash(newPassword, 12)
    SVC->>DB: BEGIN TRANSACTION
    SVC->>DB: UPDATE users SET password = newHash
    SVC->>DB: UPDATE password_reset_tokens SET usedAt = now()
    SVC->>DB: COMMIT
    API2-->>B: 200 password updated — redirect to login
```

---

## Diagram 6 — Route Tier Enforcement

> The three access tiers enforced by `middleware.ts` on every request.

```mermaid
flowchart TD
    REQ["Incoming Request"]

    REQ --> CHECK_L0{"Is route on\nL0 public allowlist?"}
    CHECK_L0 -->|"Yes"| L0_PASS["Pass through\nNo auth check\nNo rate limit"]
    CHECK_L0 -->|"No"| CHECK_JWT{"Valid JWT\nin cookie?"}
    CHECK_JWT -->|"No"| REJECT_401["401 or redirect\nto /auth/login"]
    CHECK_JWT -->|"Yes"| CHECK_L2{"Is route\nadmin only L2?"}
    CHECK_L2 -->|"Yes"| CHECK_ROLE{"ADMIN role\nin JWT claims?"}
    CHECK_ROLE -->|"No"| REJECT_403["403 Forbidden"]
    CHECK_ROLE -->|"Yes"| L2_PASS["Pass to admin route handler"]
    CHECK_L2 -->|"No — L1 member route"| L1_PASS["Pass to member route handler"]

    subgraph L0_ROUTES["L0 — Public Routes"]
        PUB1["/"]
        PUB2["/auth/*"]
        PUB3["/api/v1/auth/*"]
        PUB4["/api/v1/health"]
        PUB5["/api/v1/webhooks/*"]
        PUB6["/whatsapp"]
    end

    subgraph L1_ROUTES["L1 — Authenticated Member Routes"]
        MEM1["/dashboard/*"]
        MEM2["/api/v1/contributions/*"]
        MEM3["/api/v1/mandates/*"]
        MEM4["/api/v1/members/*"]
        MEM5["/api/v1/bank-accounts/*"]
        MEM6["/api/v1/notifications/*"]
    end

    subgraph L2_ROUTES["L2 — Admin Only Routes"]
        ADM1["/admin/*"]
        ADM2["/api/v1/admin/*"]
    end
```
