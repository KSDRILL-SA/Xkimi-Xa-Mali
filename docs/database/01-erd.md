# Entity Relationship Diagram

| | |
|---|---|
| **Purpose** | Complete visual map of every table, relationship, cardinality, and key constraint in the database |
| **Schema file** | `packages/database/prisma/schema.prisma` |
| **Migration** | `packages/database/prisma/migrations/20241201000000_initial_schema` |
| **Tables** | 18 (including Invitation — M11a) |
| **Related Docs** | [02-normalization.md](./02-normalization.md) · [03-schema-design.md](./03-schema-design.md) |

---

## Diagram 1 — Core Domain Relationships

> Identity, Banking, Contributions, and Transactions — the financial core.

```mermaid
erDiagram
    USER {
        string id PK
        string email UK
        string phone UK
        string firstName
        string lastName
        string idNumber "AES-256-GCM encrypted"
        string password "bcrypt cost 12"
        enum status "PENDING ACTIVE SUSPENDED"
        datetime popiaConsentAt
        datetime createdAt
        datetime updatedAt
    }

    ROLE {
        string id PK
        string name UK "ADMIN or MEMBER"
    }

    USER_ROLE {
        string userId FK
        string roleId FK
    }

    BANK_ACCOUNT {
        string id PK
        string userId FK
        string bankName
        string accountNumber "AES-256-GCM encrypted"
        enum accountType "SAVINGS CHEQUE TRANSMISSION"
        string branchCode
        boolean isPrimary
        datetime verifiedAt
        datetime createdAt
        datetime updatedAt
    }

    PAYMENT_MANDATE {
        string id PK
        string userId FK
        string bankAccountId FK
        int debitDay "1 to 28"
        decimal amount
        enum status "PENDING ACTIVE SUSPENDED CANCELLED"
        string netcashMandateId
        datetime createdAt
        datetime updatedAt
    }

    CONTRIBUTION {
        string id PK
        string userId FK
        int periodMonth
        int periodYear
        decimal amountDue
        decimal amountPaid
        date dueDate
        enum status "PENDING PARTIAL PAID OVERDUE WAIVED"
        datetime createdAt
        datetime updatedAt
    }

    TRANSACTION {
        string id PK
        string contributionId FK
        string paymentMandateId FK
        decimal amount
        enum type "DEBIT_ORDER MANUAL REVERSAL"
        enum status "PENDING PROCESSING SUCCESS FAILED REVERSED"
        string gatewayRef
        string idempotencyKey UK
        datetime processedAt
        datetime createdAt
    }

    USER ||--o{ USER_ROLE : "has role"
    ROLE ||--o{ USER_ROLE : "assigned to"
    USER ||--o{ BANK_ACCOUNT : "owns"
    USER ||--o{ PAYMENT_MANDATE : "holds"
    BANK_ACCOUNT ||--o{ PAYMENT_MANDATE : "backs"
    USER ||--o{ CONTRIBUTION : "owes"
    PAYMENT_MANDATE ||--o{ TRANSACTION : "produces"
    CONTRIBUTION ||--o{ TRANSACTION : "settled by"
```

---

## Diagram 2 — Support Domain Relationships

> Goals, Notifications, Audit, Auth tokens, and Invitations.

```mermaid
erDiagram
    USER {
        string id PK
        string email UK
    }

    GOAL {
        string id PK
        string createdById FK
        enum type "MONTHLY YEARLY CUSTOM"
        string title
        decimal targetAmount
        decimal currentAmount
        date deadline
        enum status "DRAFT ACTIVE ACHIEVED FAILED"
        datetime createdAt
        datetime updatedAt
    }

    GOAL_PROGRESS {
        string id PK
        string goalId FK
        decimal amount
        datetime recordedAt
    }

    NOTIFICATION_TEMPLATE {
        string id PK
        string slug UK
        enum channel "SMS EMAIL PUSH"
        string body
    }

    NOTIFICATION {
        string id PK
        string userId FK
        string templateId FK
        enum channel "SMS EMAIL PUSH"
        enum status "QUEUED SENT FAILED"
        json payload
        datetime sentAt
        datetime createdAt
    }

    NOTIFICATION_PREFERENCE {
        string id PK
        string userId FK
        boolean sms
        boolean email
        boolean push
    }

    AUDIT_LOG {
        string id PK
        string userId FK
        string action
        string entity
        string entityId
        json payload
        string ipAddress
        datetime createdAt
    }

    PASSWORD_RESET_TOKEN {
        string id PK
        string userId FK
        string tokenHash UK
        datetime expiresAt
        datetime usedAt
    }

    EMAIL_VERIFICATION_TOKEN {
        string id PK
        string userId FK
        string tokenHash UK
        datetime expiresAt
        datetime usedAt
    }

    INVITATION {
        string id PK
        string invitedById FK
        string acceptedById FK
        string codeHash UK
        string email UK
        string phone UK
        decimal minimumAmount
        enum status "PENDING ACCEPTED REVOKED EXPIRED"
        datetime expiresAt
        datetime createdAt
    }

    USER ||--o{ GOAL : "creates"
    GOAL ||--o{ GOAL_PROGRESS : "tracked by"
    NOTIFICATION_TEMPLATE ||--o{ NOTIFICATION : "renders"
    USER ||--o{ NOTIFICATION : "receives"
    USER ||--o| NOTIFICATION_PREFERENCE : "has"
    USER ||--o{ AUDIT_LOG : "generates"
    USER ||--o{ PASSWORD_RESET_TOKEN : "requests"
    USER ||--o{ EMAIL_VERIFICATION_TOKEN : "verifies via"
    USER ||--o{ INVITATION : "sends"
    USER |o--o{ INVITATION : "accepted as"
```

---

## Diagram 3 — Key Constraints and Indexes

```mermaid
flowchart TD
    subgraph DOUBLE_BILLING["Double-Billing Guards"]
        DB1["CONTRIBUTION\nUNIQUE userId + periodMonth + periodYear\none record per member per month"]
        DB2["TRANSACTION\nUNIQUE idempotencyKey\nblocks double-charge on retry"]
    end

    subgraph IDENTITY_UK["Identity Unique Constraints"]
        ID1["USER.email — UK"]
        ID2["USER.phone — UK"]
        ID3["ROLE.name — UK"]
        ID4["SESSION.sessionToken — UK"]
        ID5["PASSWORD_RESET_TOKEN.tokenHash — UK"]
        ID6["EMAIL_VERIFICATION_TOKEN.tokenHash — UK"]
        ID7["NOTIFICATION_TEMPLATE.slug — UK"]
        ID8["NOTIFICATION_PREFERENCE.userId — UK\none preference row per member"]
    end

    subgraph PERF_IDX["Performance Indexes"]
        PI1["CONTRIBUTION: status + dueDate\noverdue detection — daily job"]
        PI2["TRANSACTION: status + createdAt\ndashboard stats query"]
        PI3["TRANSACTION: gatewayRef\nwebhook deduplication lookup"]
        PI4["NOTIFICATION: userId + createdAt\nmember inbox pagination"]
        PI5["NOTIFICATION: status\ndelivery queue flush"]
        PI6["AUDIT_LOG: entity + entityId\nevent trace by entity"]
        PI7["AUDIT_LOG: userId + createdAt\nuser activity timeline"]
    end
```

---

## Diagram 4 — Encrypted Fields

```mermaid
flowchart LR
    subgraph ENCRYPTED["AES-256-GCM at Application Layer"]
        E1["USER.idNumber\nSA ID number — high sensitivity PII"]
        E2["BANK_ACCOUNT.accountNumber\nSA bank account number — financial PII"]
    end

    subgraph PLAIN["Stored Plain — Intentional"]
        P1["USER.email\nindexed for auth lookup"]
        P2["USER.phone\nindexed for SMS lookup"]
        P3["BANK_ACCOUNT.bankName / branchCode\nnot sensitive"]
        P4["CONTRIBUTION / TRANSACTION amounts\nnot PII — required for reporting"]
    end

    subgraph KEY_MGMT["Key Management"]
        K1["ENCRYPTION_KEY env var\n64 hex chars — 32 bytes"]
        K2["lib/encryption.ts\nencrypt and decrypt\nAES-256-GCM with random IV per value"]
        K3["format: iv:authTag:ciphertext\neach value has unique IV"]
    end

    K1 --> K2 --> E1 & E2
```

---

## Table Reference

| Table | Primary Access Pattern | Notes |
|---|---|---|
| `users` | By email, by id | Core identity record |
| `roles` | By name | ADMIN and MEMBER only — 2 rows total |
| `user_roles` | By userId | Founder has 2 rows (both roles) |
| `accounts` | By userId | NextAuth OAuth adapter table |
| `sessions` | By sessionToken | JWT strategy — minimal rows |
| `password_reset_tokens` | By tokenHash | Cleaned up after use |
| `email_verification_tokens` | By tokenHash | Cleaned up after use |
| `bank_accounts` | By userId | 1–3 accounts per member |
| `payment_mandates` | By userId, by status | One active per member at a time |
| `contributions` | By userId + period, by status | One per member per month |
| `transactions` | By contributionId, by idempotencyKey | Multiple per contribution possible |
| `goals` | By status | Admin creates, members view |
| `goal_progress` | By goalId | Funding history per goal |
| `notification_templates` | By slug | Seeded, rarely changes |
| `notifications` | By userId + createdAt, by status | Inbox + delivery queue |
| `notification_preferences` | By userId | One per member |
| `audit_logs` | By entity + entityId | Append-only, never deleted |
| `invitations` | By codeHash, by email | M11a — invite-only onboarding |
