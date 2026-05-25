# Xkimm Xa Mali — Security Model

## Permission Tiers

| Tier | Name | Who | Access Scope |
|---|---|---|---|
| L0 | Public | Unauthenticated | `/`, `/whatsapp`, `/auth/*`, `/api/health` |
| L1 | Member | Authenticated member | Own data only across all domains |
| L2 | Admin | Founder (dual role: admin + member) | All member data, all reports, goal management, audit logs |
| L3 | System | Internal jobs + webhooks | No UI; signature-authenticated only |

---

## Route Middleware Map

```
/                           → L0 (public)
/auth/*                     → L0 (redirect to dashboard if already authed)
/whatsapp                   → L0 (public)
/dashboard/*                → L1 minimum
/admin/*                    → L2 required — 403 if member-only session
/api/v1/auth/*              → L0 with rate limiting (5 req/min per IP)
/api/v1/members/*           → L1; resource-ownership check for non-admin
/api/v1/bank-accounts/*     → L1; resource-ownership check
/api/v1/mandates/*          → L1; resource-ownership check
/api/v1/contributions/*     → L1; resource-ownership check
/api/v1/transactions/*      → L1; resource-ownership check
/api/v1/goals               → L1 (read); L2 (write)
/api/v1/admin/*             → L2 required
/api/v1/webhooks/*          → L3; HMAC signature check; session cookie rejected
```

---

## Hard Block List (L4 — Never Overridable)

These blocks are enforced at the service layer, not middleware, so they hold even if middleware is misconfigured.

```
[SEC-L4-01]  Members cannot read another member's bank account number
[SEC-L4-02]  Members cannot read another member's SA ID number
[SEC-L4-03]  Members cannot read another member's transaction amounts
[SEC-L4-04]  Members cannot directly write to Transaction or Contribution tables
[SEC-L4-05]  Admin cannot permanently delete Transaction records (reversal only)
[SEC-L4-06]  Webhook endpoints reject all requests bearing a user session cookie
[SEC-L4-07]  No endpoint processes input that has not passed Zod schema validation
[SEC-L4-08]  Encryption key is never logged, never returned in any API response
```

---

## Authentication

### Registration Flow
1. User submits: email, phone, name, SA ID, password
2. SA phone validated (regex + server check)
3. SA ID validated (Luhn algorithm, modulus-10)
4. Password hashed: bcrypt cost 12
5. Email verification link sent (Resend) — 24h expiry
6. Account status: `PENDING` until verified
7. POPIA consent timestamp recorded

### Login Flow
1. Email + password submitted
2. bcrypt compare (timing-safe)
3. On success: NextAuth creates session
4. HTTP-only cookie set: `SameSite=Strict`, `Secure`, 7-day expiry
5. Session stored server-side (DB-backed NextAuth adapter)

### Password Reset
1. Email submitted — always return 200 (no user enumeration)
2. If email exists: reset token generated (32-byte random, SHA-256 hashed before storage)
3. Link expires in 1 hour
4. On use: token invalidated immediately

---

## Session Security

```
Cookie flags:      HttpOnly, Secure, SameSite=Strict
Session duration:  7 days (sliding)
Session storage:   DB-backed (NextAuth Prisma adapter)
CSRF protection:   SameSite=Strict + Origin header check
Token rotation:    On each request within rolling window
Concurrent sessions: Allowed (multiple devices)
Force logout:      Admin can invalidate all sessions for a user
```

---

## Rate Limiting (Upstash Redis)

| Endpoint Group | Limit | Window |
|---|---|---|
| Auth (login, register, reset) | 5 requests | 1 minute per IP |
| All other API routes | 60 requests | 1 minute per IP |
| Statement download | 10 requests | 1 hour per user |
| Webhook endpoints | 1000 requests | 1 minute (Netcash IP allowlist) |

---

## Webhook Security

All inbound webhooks are verified before processing:

**Netcash:**
- Source IP allowlisted (Netcash published IP ranges)
- HMAC-SHA256 signature on payload using `NETCASH_WEBHOOK_SECRET`
- Replay attack prevention: timestamp within ±5 minutes

**Inngest:**
- Inngest signing key verification (built into Inngest SDK)
- Requests outside Inngest infrastructure rejected

---

## Encryption

```
Algorithm:   AES-256-GCM
Key source:  ENCRYPTION_KEY env var (32-byte hex, never committed)
IV:          Random 16 bytes, prepended to ciphertext
At-rest:     SA ID numbers, bank account numbers
In-transit:  TLS 1.3 (enforced by Vercel)
Key rotation: Manual; re-encryption script available in /scripts
```

---

## POPIA Compliance (Protection of Personal Information Act)

South Africa's data protection law equivalent to GDPR.

| Requirement | Implementation |
|---|---|
| Consent | Recorded at registration with ISO timestamp |
| Purpose limitation | Data used only for contribution management |
| Data minimisation | Only collect what is required (no unnecessary fields) |
| Right of access | `GET /api/v1/members/:id/export` — full data zip |
| Right to erasure | Soft-delete → 90-day hard purge (financial records: 5-year retention) |
| Data breach notification | Sentry alert → admin notification within 72h |
| Third-party sharing | Only Netcash (payment processor) — disclosed in privacy policy |
| Cross-border transfer | All data in South Africa/EU (Neon + Vercel) |

---

## Constitution Entries

```
[SEC-S01]  All passwords hashed with bcrypt cost 12 minimum
[SEC-S02]  All sessions use HTTP-only cookies with SameSite=Strict
[SEC-S03]  SA ID numbers and bank account numbers encrypted at rest (AES-256-GCM)
[SEC-S04]  All inputs validated with Zod before any business logic executes
[SEC-S05]  Rate limiting applied at API gateway level via Upstash
[SEC-S06]  Webhook endpoints verified by HMAC signature — no session cookie accepted
[SEC-S07]  No user enumeration: password reset always returns 200
[SEC-S08]  Audit log written for every state-changing operation
[SEC-S09]  POPIA consent recorded at registration; data export endpoint required
[SEC-S10]  Admin cannot bypass L4 hard blocks — enforced in service layer
```
