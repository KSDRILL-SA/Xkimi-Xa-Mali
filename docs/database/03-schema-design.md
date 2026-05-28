# Schema Design Decisions

| | |
|---|---|
| **Purpose** | Documents every non-obvious design decision in the schema — what was chosen, what was rejected, and why |
| **Audience** | Engineers extending the schema, technical reviewers |
| **Related Docs** | [01-erd.md](./01-erd.md) · [02-normalization.md](./02-normalization.md) |

---

## Diagram 1 — Decision Map Overview

```mermaid
flowchart TD
    subgraph MONEY["Money and Precision"]
        D1["Decimal not Float\nfor all financial amounts"]
        D2["Decimal 10,2\ntwo decimal places for ZAR cents"]
        D3["Decimal.js in application layer\nfor arithmetic operations"]
    end

    subgraph IDENTITY_D["Identity and Keys"]
        D4["CUID not UUID\nfor all primary keys"]
        D5["Hashed tokens not raw\nfor password reset and email verify"]
        D6["No auto-increment integers\nfor any PK"]
    end

    subgraph ENCRYPTION_D["Encryption"]
        D7["Application-layer AES-256-GCM\nnot database-level encryption"]
        D8["Random IV per value\nnot a shared IV"]
        D9["SA ID and bank account only\nnot email or phone"]
    end

    subgraph TEMPORAL["Time and Dates"]
        D10["TIMESTAMP with timezone\nall datetime columns"]
        D11["periodMonth and periodYear as integers\nnot a single date column"]
        D12["SAST UTC+2 handling\nin application not in DB"]
    end

    subgraph INTEGRITY["Data Integrity"]
        D13["Restrict on delete\nfor financial relationships"]
        D14["Cascade on delete\nfor identity relationships"]
        D15["Idempotency key as unique column\nnot a Redis-only check"]
    end
```

---

## Money — Why `Decimal(10,2)` Not `Float`

```mermaid
flowchart LR
    subgraph FLOAT_PROBLEM["Float — Rejected"]
        FP1["IEEE 754 floating point\ncannot represent 0.1 exactly in binary"]
        FP2["R100.10 + R0.10 = R100.19999999999999\nFloating point rounding error"]
        FP3["Silently wrong financial totals\nUnacceptable for any money system"]
    end

    subgraph DECIMAL_SOLUTION["Decimal 10,2 — Chosen"]
        DS1["PostgreSQL NUMERIC type\nexact decimal arithmetic in the database"]
        DS2["Prisma maps to Decimal.js at runtime\nexact arithmetic in JavaScript too"]
        DS3["10 digits total, 2 decimal places\nSupports up to R99,999,999.99\nFar exceeds any realistic pool size"]
        DS4["Comparison, sorting, and aggregation\nall exact — no rounding surprises"]
    end

    FLOAT_PROBLEM -.->|"replaced by"| DECIMAL_SOLUTION
```

**Rule:** Every currency column in the schema is `@db.Decimal(10,2)`. No exceptions. All arithmetic in application code uses `Decimal.js`.

---

## Primary Keys — Why CUID Not UUID

```mermaid
flowchart LR
    subgraph UUID_CONS["UUID v4 — Rejected"]
        U1["Random UUID causes B-tree fragmentation\npages split unpredictably on insert"]
        U2["xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx\n36 characters including dashes — verbose"]
        U3["No embedded timestamp\ncannot sort by approximate creation time"]
    end

    subgraph CUID_PROS["CUID — Chosen"]
        C1["Monotonically increasing prefix\nB-tree inserts are sequential — less fragmentation"]
        C2["Embedded timestamp\napproximate chronological sort without createdAt"]
        C3["URL-safe by default\nno dashes — safe in path params directly"]
        C4["Collision resistance\ncryptographically random suffix"]
    end

    UUID_CONS -.->|"replaced by"| CUID_PROS
```

---

## Token Storage — Why Hashed

```mermaid
flowchart TD
    subgraph TOKEN_DESIGN["Password Reset and Email Verification Token Design"]
        FLOW1["Application generates cryptographically random token\nusing crypto.randomBytes(32).toString('hex')"]
        FLOW2["Token is hashed with SHA-256\nbefore storing in database"]
        FLOW3["Plaintext token is sent to user via email\nOne-time use link contains the plaintext token"]
        FLOW4["On validation: hash the submitted token\ncompare to stored hash\nConstant-time comparison to prevent timing attacks"]
        FLOW5["If DB is breached\nattacker has hashes — not redeemable tokens\nThe plaintext tokens were never stored"]
    end

    FLOW1 --> FLOW2 --> FLOW3 --> FLOW4 --> FLOW5
```

**Why not JWT for reset tokens?** JWTs are self-contained and cannot be revoked. A hashed DB token can be invalidated by setting `usedAt` — this prevents token reuse even if the email was forwarded or the link was bookmarked.

---

## Application-Layer Encryption — Why Not DB Encryption

```mermaid
flowchart TD
    subgraph DB_ENC["Database-level Encryption — Rejected"]
        DBE1["Transparent Data Encryption TDE\nEncrypts data at rest on disk"]
        DBE2["Plaintext visible to anyone\nwith a valid DB connection"]
        DBE3["DBA or compromised connection string\ngives full access to SA ID numbers and bank accounts"]
        DBE4["Neon does not offer column-level TDE\nat the free or standard tier"]
    end

    subgraph APP_ENC["Application-Layer AES-256-GCM — Chosen"]
        AE1["Encrypted before writing to DB\nDecrypted only when explicitly needed"]
        AE2["Ciphertext in DB\nEven a compromised DB connection\nreveals only encrypted blobs"]
        AE3["Key lives in ENCRYPTION_KEY env var\nNever in the DB, never in code"]
        AE4["AES-256-GCM provides\nboth encryption and authentication tag\nTampering is detectable"]
        AE5["Random IV per encryption call\nSame plaintext produces different ciphertext each time\nPrevents frequency analysis"]
    end

    DB_ENC -.->|"replaced by"| APP_ENC
```

**What is encrypted:** `users.idNumber`, `bank_accounts.accountNumber`

**What is NOT encrypted (intentional):** `users.email` and `users.phone` are authentication lookup keys — encrypting them would require decrypting every row to find a match, making login O(n). The threat model accepts that email and phone are stored in plain text because they are semi-public identifiers.

---

## Period Columns — Why `periodMonth` and `periodYear` as Integers

```mermaid
flowchart LR
    subgraph DATE_APPROACH["Single Date Column — Rejected"]
        DA1["contributionDate DATE\nRequires extracting month and year\non every query"]
        DA2["WHERE EXTRACT(MONTH FROM contributionDate) = 6\nPrevents index use\nFull table scan on every filter"]
    end

    subgraph INT_APPROACH["Integer Pair — Chosen"]
        IA1["periodMonth INT and periodYear INT\nDirect equality comparison"]
        IA2["WHERE periodMonth = 6 AND periodYear = 2025\nUses composite index directly\nFull index seek not a scan"]
        IA3["UNIQUE userId + periodMonth + periodYear\nDB enforces one record per member per month\nat the constraint level"]
    end

    DATE_APPROACH -.->|"replaced by"| INT_APPROACH
```

---

## Delete Behaviour — Restrict vs Cascade

```mermaid
flowchart TD
    subgraph CASCADE_TABLES["Cascade on Delete — Identity tables"]
        CA1["users DELETE cascades to:\naccounts, sessions\npassword_reset_tokens\nemail_verification_tokens\nnotifications, notification_preferences\nuser_roles"]
        CA2["Why: These are identity-bound records\nDeleting a user should clean up their session and auth state\nNo orphaned auth tokens should persist"]
    end

    subgraph RESTRICT_TABLES["Restrict on Delete — Financial tables"]
        RE1["users DELETE restricted by:\npayment_mandates, contributions, audit_logs"]
        RE2["bank_accounts DELETE restricted by:\npayment_mandates"]
        RE3["contributions DELETE restricted by:\ntransactions"]
        RE4["payment_mandates DELETE restricted by:\ntransactions"]
        RE5["Why: Financial records must not vanish\nif a user is deleted or suspended\nAudit trail and transaction history\nmust be preserved indefinitely\nUser suspension is soft — status SUSPENDED\nnot a DELETE operation"]
    end
```

---

## Idempotency Key — Why a Unique DB Column Not Redis-Only

```mermaid
flowchart LR
    subgraph REDIS_ONLY["Redis-Only Idempotency — Rejected"]
        RO1["Store idempotency key in Redis with TTL\nCheck before writing transaction"]
        RO2["Race condition risk:\nTwo concurrent requests\nboth check Redis simultaneously\nboth see key absent\nboth write transactions — double charge"]
        RO3["Redis failure risk:\nIf Redis is down at check time\nidempotency check is bypassed completely"]
    end

    subgraph DB_UNIQUE["Unique DB Column — Chosen"]
        DU1["transactions.idempotencyKey has UNIQUE constraint\nDatabase enforces uniqueness atomically"]
        DU2["INSERT throws constraint violation\nif key already exists\nSecond request returns error — no double write"]
        DU3["Works even if Redis is unavailable\nThe DB is the source of truth\nRedis used for pre-check only — not as the guard"]
        DU4["Key format: userId_mandateId_periodMonth_periodYear\nDeterministic — same inputs always produce same key"]
    end

    REDIS_ONLY -.->|"replaced by"| DB_UNIQUE
```

---

## Index Strategy Summary

| Index | Table | Columns | Query It Serves |
|---|---|---|---|
| Unique | `users` | `email` | Auth login lookup |
| Unique | `users` | `phone` | SA phone duplicate check |
| Unique | `sessions` | `sessionToken` | NextAuth session validation |
| Unique | `contributions` | `userId, periodMonth, periodYear` | One record per member per month |
| Unique | `transactions` | `idempotencyKey` | Double-charge prevention |
| Composite | `contributions` | `status, dueDate` | Overdue detection daily job |
| Composite | `transactions` | `status, createdAt` | Dashboard stats query |
| Single | `transactions` | `gatewayRef` | Webhook deduplication |
| Composite | `notifications` | `userId, createdAt` | Member inbox pagination |
| Single | `notifications` | `status` | Delivery queue flush |
| Composite | `audit_logs` | `entity, entityId` | Event trace per entity |
| Composite | `audit_logs` | `userId, createdAt` | User activity timeline |
| Single | `password_reset_tokens` | `userId` | Token cleanup per user |
| Single | `email_verification_tokens` | `userId` | Token cleanup per user |
