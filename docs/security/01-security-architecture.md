# Security Architecture

| | |
|---|---|
| **Purpose** | Documents every security layer in the system — authentication tiers, encryption, rate limiting, webhook verification, POPIA compliance, and the audit trail |
| **Audience** | Engineers, security reviewers, compliance |
| **Related Docs** | [../flows/01-auth-flow.md](../flows/01-auth-flow.md) · [../database/03-schema-design.md](../database/03-schema-design.md) · [../flows/05-invite-registration-flow.md](../flows/05-invite-registration-flow.md) |

---

## Diagram 1 — Security Layers Overview

```mermaid
flowchart TD
    subgraph LAYER1["Layer 1 — Transport Security"]
        L1A["HTTPS enforced everywhere\nVercel automatic TLS\nHTTP redirects to HTTPS\nHSTS header set"]
        L1B["HTTP-only cookies\nSession token not accessible via JavaScript\nXSS cannot steal the session"]
        L1C["SameSite=Lax cookies\nCSRF protection built-in\nNextAuth CSRF token on state-changing requests"]
    end

    subgraph LAYER2["Layer 2 — Authentication and Authorisation"]
        L2A["NextAuth.js Credentials provider\nJWT signed with NEXTAUTH_SECRET\n30-day session TTL"]
        L2B["Route tier enforcement in middleware\nL0 public, L1 member, L2 admin\nEvery request checked before handler"]
        L2C["Role claims in JWT\nADMIN and MEMBER roles\nNever trust client-supplied userId"]
    end

    subgraph LAYER3["Layer 3 — Input Validation"]
        L3A["Zod schemas on every API route\nClient and server share the same schema\nRejects malformed input before service layer"]
        L3B["SA-specific validators\nLuhn check on SA ID number\nRegex on SA phone format\n+27 normalisation"]
        L3C["Domain constraint validation\ndebitDay 1 to 28\namount min R100\nperiod month 1 to 12"]
    end

    subgraph LAYER4["Layer 4 — Data Protection"]
        L4A["AES-256-GCM encryption\nSA ID number and bank account number\nRandom IV per value\nNever stored in plaintext"]
        L4B["bcrypt password hashing\nCost factor 12\nResistant to GPU brute force\nRainbow tables impossible"]
        L4C["Hashed tokens\nPassword reset and email verification\nSHA-256 hash stored not raw token\nCompromised DB cannot redeem tokens"]
    end

    subgraph LAYER5["Layer 5 — Rate Limiting and Abuse Prevention"]
        L5A["Upstash Redis sliding window\nAuth routes: 5 per 15 min per IP\nMandate mutations: 10 per hour per user\nInvite validation: 5 per 15 min per IP"]
        L5B["Idempotency keys in DB\nUNIQUE constraint prevents double-charge\nSafe under concurrent requests and retries"]
        L5C["Invite code entropy\n50-bit Crockford Base32\nBrute force infeasible at 5 attempts per 15 min"]
    end

    subgraph LAYER6["Layer 6 — Webhook Security"]
        L6A["HMAC-SHA256 on Netcash webhooks\ntimingSafeEqual comparison\nPrevents signature timing attacks"]
        L6B["Inngest signing key verification\nBuilt-in to Inngest SDK\nRejects unsigned or tampered payloads"]
        L6C["BulkSMS IP allowlist\nOnly BulkSMS IP ranges accepted\nfor delivery receipt webhooks"]
    end

    subgraph LAYER7["Layer 7 — Audit and Compliance"]
        L7A["Append-only audit_logs table\nEvery admin action logged\nIP address, userId, action, entity, payload"]
        L7B["POPIA data export endpoint\nMember can download their own data\nZIP with JSON data extract"]
        L7C["Data minimisation\nOnly SA ID and bank account collected\nNot more than needed"]
    end

    LAYER1 --> LAYER2 --> LAYER3 --> LAYER4
    LAYER4 --> LAYER5 --> LAYER6 --> LAYER7
```

---

## Diagram 2 — Route Tier Security Model

```mermaid
flowchart TD
    REQ["HTTP Request"]
    REQ --> HTTPS{"HTTPS only?\nVercel enforces"}
    HTTPS -->|"HTTP"| REDIRECT["301 redirect to HTTPS"]
    HTTPS -->|"HTTPS"| COOKIE{"Session cookie\npresent?"}

    subgraph L0["L0 — Public Routes — No auth required"]
        P_LIST["/ · /whatsapp · /auth/*\n/api/v1/auth/* · /api/v1/health\n/api/v1/webhooks/*"]
    end

    COOKIE -->|"No cookie — L0 route"| L0
    COOKIE -->|"No cookie — L1 or L2 route"| REJECT_401["401 or redirect to /auth/login"]
    COOKIE -->|"Cookie present"| JWT_VERIFY{"JWT valid\nand not expired?"}
    JWT_VERIFY -->|"No"| REJECT_SESSION["401 session expired"]
    JWT_VERIFY -->|"Yes"| ROUTE_CHECK{"Route tier?"}

    ROUTE_CHECK -->|"L1 — member route"| L1["Pass to handler\nSession available in context"]
    ROUTE_CHECK -->|"L2 — admin route"| ROLE_CHECK{"ADMIN in\nJWT roles?"}
    ROLE_CHECK -->|"No"| REJECT_403["403 Forbidden"]
    ROLE_CHECK -->|"Yes"| L2["Pass to admin handler"]
```

---

## Diagram 3 — Encryption Architecture

```mermaid
flowchart LR
    subgraph ENCRYPT_WRITE["Write Path — Encrypting sensitive data"]
        W1["Application receives\nplaintext SA ID or bank account number"]
        W2["lib/encryption.ts encrypt()"]
        W3["Generate 12-byte random IV\ncrypto.randomBytes(12)"]
        W4["AES-256-GCM encrypt\nKey from ENCRYPTION_KEY env var\n32 bytes — 256 bits"]
        W5["Produce: ciphertext + authTag\nFormat stored: base64(iv):base64(authTag):base64(ciphertext)"]
        W6["Store opaque string in DB\nusers.idNumber or bank_accounts.accountNumber"]
    end

    subgraph DECRYPT_READ["Read Path — Decrypting when needed"]
        R1["Fetch encrypted string from DB"]
        R2["Split on colon separator\nExtract IV, authTag, ciphertext"]
        R3["AES-256-GCM decrypt\nSame key from ENCRYPTION_KEY\nVerify authTag — detects tampering"]
        R4["Return plaintext to caller\nHeld in memory only\nNever logged or cached"]
        R5["Used for: Netcash API calls\nAdmin viewing member bank details\nPOPIA data export"]
    end

    W1 --> W2 --> W3 --> W4 --> W5 --> W6
    W6 --> R1 --> R2 --> R3 --> R4 --> R5
```

---

## Diagram 4 — Webhook Verification Chain

```mermaid
flowchart TD
    subgraph NETCASH_WH["Netcash Webhook Verification"]
        NW1["POST /api/v1/webhooks/netcash"]
        NW2["Extract X-Netcash-Signature header"]
        NW3["HMAC-SHA256(body, NETCASH_WEBHOOK_SECRET)"]
        NW4["crypto.timingSafeEqual(computed, received)\nConstant-time comparison\nPrevents timing attack on signature"]
        NW5["Reject with 401 if mismatch\nNetcash marks delivery as failed\nNo event processed"]
        NW6["Continue to mandate.service\nif signature valid"]
        NW1 --> NW2 --> NW3 --> NW4
        NW4 -->|"Invalid"| NW5
        NW4 -->|"Valid"| NW6
    end

    subgraph INNGEST_WH["Inngest Webhook Verification"]
        IW1["POST /api/v1/webhooks/inngest"]
        IW2["Inngest SDK middleware\nverifyWebhookSignature()"]
        IW3["HMAC-SHA256 with INNGEST_SIGNING_KEY\nBuilt-in to Inngest serve() handler"]
        IW4["Reject with 401 if invalid\nInngest retries delivery"]
        IW5["Dispatch to matching function\nif signature valid"]
        IW1 --> IW2 --> IW3
        IW3 -->|"Invalid"| IW4
        IW3 -->|"Valid"| IW5
    end
```

---

## Diagram 5 — POPIA Compliance Map

```mermaid
flowchart TD
    subgraph DATA_COLLECTED["Data Collected from Members"]
        DC1["Full name — necessary for mandate and notifications"]
        DC2["Email address — authentication and communication"]
        DC3["SA phone number — SMS notifications and mandate"]
        DC4["SA ID number — identity verification — encrypted at rest"]
        DC5["Physical address — optional — POPIA requires address for some mandate types"]
        DC6["Bank account details — encrypted at rest — required for debit orders"]
        DC7["Contribution and transaction history — financial records — required by law"]
    end

    subgraph DATA_RIGHTS["Member Rights Under POPIA"]
        DR1["Right to access\nGET /api/v1/members/id/export\nReturns ZIP with all their data as JSON"]
        DR2["Right to correction\nProfile edit form updates name, phone, address"]
        DR3["Right to deletion\nAccount suspension workflow\nFinancial records retained — legal obligation"]
        DR4["Right to object\nNotification preferences\nSMS, email, push can be disabled individually"]
    end

    subgraph TECHNICAL_CONTROLS["Technical Controls"]
        TC1["AES-256-GCM on SA ID and bank account\nEncrypted before writing to DB\nKey never in source code"]
        TC2["popiaConsentAt timestamp\nRecorded when member accepts consent checkbox\nLegal proof of consent"]
        TC3["Audit log of all access\nEvery admin view of member data is logged\nWith admin userId and timestamp"]
        TC4["Data minimisation\nOnly data required for the business purpose is collected\nNo unnecessary fields"]
    end

    DATA_COLLECTED --> TECHNICAL_CONTROLS
    DATA_COLLECTED --> DATA_RIGHTS
```

---

## Diagram 6 — Rate Limiting Strategy

```mermaid
flowchart LR
    subgraph LIMITS["Rate Limits by Endpoint Type"]
        RL1["Authentication — per IP\n5 requests per 15 minutes\nPrevents credential stuffing\nApplied at middleware level"]

        RL2["Invite validation — per IP\n5 requests per 15 minutes\nPrevents invite code brute force\nApplied at route handler level"]

        RL3["Mandate create/update/cancel — per user\n10 requests per 1 hour\nPrevents mandate spam\nApplied at route handler level"]

        RL4["Password reset request — per IP\n3 requests per 1 hour\nPrevents email flooding\nApplied at route handler level"]

        RL5["General API routes — per user\nNo hard limit currently\nVercel WAF handles DDoS at edge"]
    end

    subgraph IMPLEMENTATION["Implementation"]
        IMP1["Upstash Ratelimit with sliding window algorithm\n@upstash/ratelimit package"]
        IMP2["Rate limit key: ip or userId\nDepending on whether route requires auth"]
        IMP3["Limit check returns allow or deny with retryAfter\n429 response with Retry-After header"]
        IMP4["Redis TTL auto-expires counters\nNo manual cleanup required"]
    end

    LIMITS --> IMPLEMENTATION
```

---

## Diagram 7 — Audit Log Coverage

> Every admin action that writes an audit log entry.

```mermaid
flowchart TD
    subgraph MANDATE_AUDIT["Mandate Events"]
        MA1["CREATE_MANDATE — member creates DebiCheck mandate"]
        MA2["UPDATE_MANDATE — debit day or amount changed"]
        MA3["CANCEL_MANDATE — member or admin cancels"]
        MA4["MANDATE_STATUS_UPDATED — Netcash webhook received"]
        MA5["MANDATE_DELAY_REQUESTED — member replies DELAY"]
    end

    subgraph CONTRIB_AUDIT["Contribution Events"]
        CA1["CONTRIBUTION_CREATED — month rollover or admin generate"]
        CA2["PAYMENT_SUBMITTED — manual payment initiated"]
        CA3["PAYMENT_SETTLED — Netcash webhook SUCCESS"]
        CA4["PAYMENT_FAILED — Netcash webhook FAILED"]
        CA5["CONTRIBUTION_WAIVED — admin waives outstanding"]
    end

    subgraph ADMIN_AUDIT["Admin Actions"]
        AA1["MEMBER_SUSPENDED — admin suspends member"]
        AA2["MEMBER_REACTIVATED — admin reactivates member"]
        AA3["INVITE_CREATED — admin generates invite code"]
        AA4["INVITE_REVOKED — admin revokes unused invite"]
        AA5["GOAL_CREATED — admin creates financial goal"]
        AA6["GOAL_LOCKED — admin locks goal irreversibly"]
        AA7["FORCE_DEBIT_TRIGGERED — admin triggers emergency debit"]
    end

    subgraph AUDIT_FIELDS["Every Audit Log Entry Contains"]
        AF1["id — unique log entry ID"]
        AF2["userId — who performed the action\nnullable for system-initiated events"]
        AF3["action — machine-readable event name"]
        AF4["entity — table name e.g. PaymentMandate"]
        AF5["entityId — the affected record ID"]
        AF6["payload — JSON snapshot of relevant state"]
        AF7["ipAddress — request IP for admin actions"]
        AF8["createdAt — immutable timestamp"]
    end

    MANDATE_AUDIT --> AUDIT_FIELDS
    CONTRIB_AUDIT --> AUDIT_FIELDS
    ADMIN_AUDIT --> AUDIT_FIELDS
```

---

## Security Decision Reference

| Decision | Choice | Reason |
|---|---|---|
| Session mechanism | HTTP-only JWT cookies | XSS cannot access `document.cookie` — token never in localStorage |
| Password hashing | bcrypt cost 12 | GPU-resistant — 12 rounds = ~250ms hash time, impractical to brute force |
| Token storage | SHA-256 hash only | Compromised DB cannot redeem tokens — plaintext never persisted |
| ID and bank account | AES-256-GCM | Authenticated encryption — detects tampering, not just confidentiality |
| IV strategy | Random 12-byte IV per value | Same plaintext never produces same ciphertext — prevents frequency analysis |
| Webhook verification | HMAC-SHA256 timingSafeEqual | Prevents both forgery and timing attacks on signature comparison |
| Rate limiting | Sliding window per IP or user | Prevents credential stuffing, code brute force, and mandate spam |
| Idempotency key | UNIQUE DB column | DB-level guarantee — Redis failure cannot enable double-charge |
| User enumeration | Prevented on forgot-password | Always returns 200 — attacker cannot discover registered emails |
| Admin route protection | JWT role claim check in middleware | Role cannot be spoofed — claims are in server-signed JWT |
