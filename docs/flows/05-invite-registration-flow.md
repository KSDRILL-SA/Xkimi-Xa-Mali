# Invite and Registration Flow (M11a)

| | |
|---|---|
| **Purpose** | Documents the invite-gated registration system — from admin creating an invite to member completing signup |
| **Module** | M11a Invite and Access Control (patches M02 Auth System) |
| **Status** | ✅ IMPLEMENTED — M11a complete; frontend completed in Phase 2 Step 5 (PR #64) |
| **Related Docs** | [01-auth-flow.md](./01-auth-flow.md) · [../database/01-erd.md](../database/01-erd.md) · [../security/01-security-architecture.md](../security/01-security-architecture.md) |

---

## Why Invite-Gated Registration?

Current state (pre-M11a): Registration is open. Any person who knows the URL and has a valid SA ID and phone number can create an account. This is a development convenience that **must be closed before production launch**.

M11a adds an invite layer: the admin generates a one-time `XKM-XXXX-XXXX` code and shares it with the intended member. Registration requires a valid, unexpired, unconsumed code whose email and phone match the submitted data. No code, no account.

---

## Diagram 1 — Invitation Status State Machine

```mermaid
stateDiagram-v2
    [*] --> PENDING : Admin creates invite\nCode generated and shown once\nStored as SHA-256 hash in DB

    PENDING --> ACCEPTED : Member uses code at registration\nCode validated and consumed atomically\nacceptedById set to new user id

    PENDING --> REVOKED : Admin revokes invite\nBefore member uses it\nCode can no longer be used

    PENDING --> EXPIRED : expiresAt has passed\n7 days from creation\nEnforced at validation time\nNot a DB job — checked on use

    ACCEPTED --> [*] : Terminal — member registered
    REVOKED --> [*] : Terminal — cannot be re-activated
    EXPIRED --> [*] : Effectively terminal\nCan only be replaced by new invite

    note right of PENDING
        codeHash stored — never plaintext
        codePrefix (4 chars) stored for admin display
        email and phone are binding constraints
    end note
```

---

## Diagram 2 — Admin Creates Invite

```mermaid
sequenceDiagram
    participant AD as Admin Browser
    participant API as POST /api/v1/admin/invitations
    participant SVC as invite.service.ts
    participant DB as PostgreSQL
    participant EMAIL as Resend
    participant AUDIT as audit.service.ts

    AD->>API: POST { firstName, lastName, email, phone, minimumAmount }
    API->>API: Zod validation\nEmail format\nSA phone format\nminimumAmount >= 100
    API->>SVC: generateInvite(adminId, params)
    SVC->>DB: Check invitations.email unique — no pending invite for this email
    alt Pending invite already exists for this email
        SVC-->>API: ConflictError
        API-->>AD: 409 invite already exists for this email
    end
    SVC->>DB: Check users.email — not already registered
    alt User already registered
        SVC-->>API: ConflictError
        API-->>AD: 409 user already registered
    end
    SVC->>SVC: Generate code\nCrockford base32 format\nXKM-XXXX-XXXX\n~50 bits of entropy
    SVC->>SVC: SHA-256 hash the plaintext code
    SVC->>SVC: Extract first 4 chars as codePrefix
    SVC->>DB: INSERT invitations\ncodeHash, codePrefix\nemail, phone binding\nminimumAmount\nexpiresAt = now + 7 days\nstatus = PENDING\ninvitedById = adminId
    SVC->>AUDIT: writeLog INVITE_CREATED, admin userId, invite id
    SVC->>EMAIL: Optional — notify admin\nthat invite was generated
    API-->>AD: 201 { code: XKM-XXXX-XXXX }\nPlaintext code shown ONCE\nNot stored — only hash in DB
    Note over AD,API: Admin shares code via WhatsApp or SMS manually
```

---

## Diagram 3 — Member Validates Invite Code (Step 1 of 2)

```mermaid
sequenceDiagram
    participant B as Member Browser
    participant PAGE as /auth/register Step 1
    participant API as POST /api/v1/auth/invitations/validate
    participant REDIS as Upstash Redis
    participant SVC as invite.service.ts
    participant DB as PostgreSQL

    B->>PAGE: Navigate to /auth/register
    PAGE->>B: Show Step 1 — Enter invite code
    B->>API: POST { code: XKM-XXXX-XXXX }
    API->>REDIS: Rate limit 5 attempts per 15 min per IP
    alt Rate limited
        API-->>B: 429 SYS_005
    end
    API->>SVC: validateInviteCode(code)
    SVC->>SVC: SHA-256 hash the submitted code
    SVC->>DB: SELECT invitations WHERE codeHash = hash
    alt Not found
        SVC-->>API: NotFoundError
        API-->>B: 400 INV_001 invalid invite code
    end
    alt status = ACCEPTED
        SVC-->>API: UsedError
        API-->>B: 400 INV_002 invite already used
    end
    alt status = REVOKED
        SVC-->>API: RevokedError
        API-->>B: 400 INV_003 invite has been revoked
    end
    alt expiresAt < now
        SVC-->>API: ExpiredError
        API-->>B: 400 INV_004 invite has expired
    end
    API-->>B: 200 { firstName, lastName, email, phone, minimumAmount }\nEmail and phone are pre-filled and locked in Step 2
```

---

## Diagram 4 — Member Completes Registration (Step 2 of 2)

```mermaid
sequenceDiagram
    participant B as Member Browser
    participant PAGE as /auth/register Step 2
    participant API as POST /api/v1/auth/register
    participant SVC as auth.service.ts
    participant INV as invite.service.ts
    participant DB as PostgreSQL
    participant EMAIL as Resend

    B->>PAGE: Step 2 form — pre-filled from Step 1 validation
    Note over PAGE: email — pre-filled and LOCKED\nphone — pre-filled and LOCKED\nfirstName — pre-filled, editable\nlastName — pre-filled, editable\nidNumber — blank, member fills own SA ID\nmonthlyAmount — min = invite.minimumAmount\npassword — member sets\nconsentToPopia — member checks

    B->>API: POST { inviteCode, email, phone, firstName, lastName, idNumber, monthlyAmount, password, consentToPopia }
    API->>API: Zod validation\ninviteCode required\nSA ID Luhn check\nmonthlyAmount >= invite.minimumAmount\nconsentToPopia must be true

    API->>SVC: registerUser(params)
    SVC->>INV: validateInviteCode(inviteCode) — re-validate anti-race
    alt Code invalid or expired between Step 1 and Step 2
        SVC-->>API: Error
        API-->>B: 400 INV_001 invite no longer valid
    end
    SVC->>SVC: Verify submitted email matches invite.email
    SVC->>SVC: Verify submitted phone matches invite.phone
    alt Binding mismatch
        SVC-->>API: ForbiddenError
        API-->>B: 403 INV_005 email or phone does not match invite
    end

    SVC->>SVC: bcrypt.hash(password, 12)
    SVC->>SVC: encrypt(idNumber) AES-256-GCM

    SVC->>DB: BEGIN TRANSACTION
    SVC->>DB: INSERT users status = PENDING
    SVC->>DB: INSERT user_roles MEMBER
    SVC->>DB: INSERT notification_preferences all true
    SVC->>DB: INSERT email_verification_token
    SVC->>DB: UPDATE invitations SET status = ACCEPTED\nacceptedById = newUser.id\nacceptedAt = now()
    SVC->>DB: COMMIT — atomic: user and invite consumed together

    SVC->>EMAIL: sendVerificationEmail
    API-->>B: 201 success — check your email to activate
```

---

## Diagram 5 — Admin Invite Management

```mermaid
flowchart TD
    subgraph ADMIN_UI["Admin Invite Management — /admin/invitations"]
        LIST["List all invites\nShows: name, email, phone\ncodePrefix (4 chars only)\nstatus, expiresAt, createdAt"]

        CREATE["Create new invite form\nFields: firstName, lastName\nemail, phone, minimumAmount\nSubmit shows code ONCE in modal\nCopy to clipboard button"]

        REVOKE["Revoke invite button\nWith confirmation modal\nOnly available for PENDING invites\nAudit logged"]
    end

    subgraph SECURITY["Security Properties"]
        S1["Full code never stored\nOnly SHA-256 hash in DB"]
        S2["Admin list shows codePrefix only\nXKM-ABCD... not the full code"]
        S3["Code shown once at creation\nIf admin loses it — revoke and regenerate"]
        S4["Single-use atomic consume\nRace condition impossible — DB transaction"]
        S5["7-day expiry\nEnforced at validate and at consume"]
        S6["Binding enforcement\nemail and phone must match invite exactly"]
    end
```

---

## Diagram 6 — Pre vs Post M11a Registration Comparison

```mermaid
flowchart LR
    subgraph BEFORE["Before M11a — Open Registration"]
        B1["Anyone with URL can register"]
        B2["Only SA ID and phone format validated"]
        B3["No admin approval needed"]
        B4["Any stranger can create an account"]
    end

    subgraph AFTER["After M11a — Invite-Gated"]
        A1["Admin creates invite for specific person"]
        A2["Code tied to specific email and phone"]
        A3["7-day expiry — timely onboarding required"]
        A4["Single-use — code dies on registration"]
        A5["Admin can revoke at any time before use"]
        A6["Full audit trail of every invite"]
    end

    BEFORE -.->|"M11a closes this"| AFTER
```

---

## Code Format Reference

Invite codes follow the pattern `XKM-XXXX-XXXX` where `XXXX` segments use Crockford Base32 encoding (excludes confusable characters I, L, O, U).

| Component | Value |
|---|---|
| Prefix | `XKM` — identifies as an Xkimm Xa Mali invite |
| Segments | Two 4-character Crockford Base32 groups |
| Entropy | ~50 bits — brute-force infeasible with rate limiting |
| Hash | SHA-256 of full plaintext code |
| DB storage | `codeHash` (full hash) + `codePrefix` (first 4 chars for display) |
| Displayed to admin | Full code once at creation time only |
| Displayed in admin list | `codePrefix` only — e.g., `XKM-AB...` |
