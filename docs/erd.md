# Xkimm Xa Mali — Entity Relationship Diagram

## ERD (Mermaid)

```mermaid
erDiagram
    USER {
        string id PK
        string email UK
        string phone UK
        string firstName
        string lastName
        string idNumber "encrypted"
        json   address
        enum   status
        datetime createdAt
        datetime updatedAt
    }

    ROLE {
        string id PK
        string name UK
    }

    USER_ROLE {
        string userId FK
        string roleId FK
    }

    BANK_ACCOUNT {
        string  id PK
        string  userId FK
        string  bankName
        string  accountNumber "encrypted"
        enum    accountType
        string  branchCode
        boolean isPrimary
        datetime verifiedAt
        datetime createdAt
    }

    PAYMENT_MANDATE {
        string  id PK
        string  userId FK
        string  bankAccountId FK
        int     debitDay
        decimal amount
        enum    status
        string  netcashMandateId
        datetime createdAt
        datetime updatedAt
    }

    CONTRIBUTION {
        string  id PK
        string  userId FK
        int     periodMonth
        int     periodYear
        decimal amountDue
        decimal amountPaid
        date    dueDate
        enum    status
        datetime createdAt
        datetime updatedAt
    }

    TRANSACTION {
        string   id PK
        string   contributionId FK
        string   mandateId FK
        decimal  amount
        enum     type
        enum     status
        string   gatewayRef
        json     gatewayResponse
        string   idempotencyKey UK
        datetime processedAt
        datetime createdAt
    }

    GOAL {
        string  id PK
        enum    type
        string  title
        string  description
        decimal targetAmount
        decimal currentAmount
        date    deadline
        enum    status
        datetime lockedAt
        string  lockedById FK
        datetime createdAt
        datetime updatedAt
    }

    GOAL_PROGRESS {
        string  id PK
        string  goalId FK
        decimal amount
        datetime recordedAt
    }

    NOTIFICATION_TEMPLATE {
        string id PK
        string slug UK
        enum   channel
        string body
    }

    NOTIFICATION {
        string   id PK
        string   userId FK
        string   templateId FK
        enum     channel
        enum     status
        json     payload
        datetime sentAt
        datetime createdAt
    }

    NOTIFICATION_PREFERENCE {
        string  id PK
        string  userId FK UK
        boolean sms
        boolean email
        boolean push
    }

    AUDIT_LOG {
        string   id PK
        string   userId FK
        string   action
        string   entity
        string   entityId
        json     payload
        string   ipAddress
        datetime createdAt
    }

    USER            ||--o{ USER_ROLE             : "has"
    ROLE            ||--o{ USER_ROLE             : "assigned to"
    USER            ||--o{ BANK_ACCOUNT          : "owns"
    USER            ||--o{ PAYMENT_MANDATE       : "holds"
    BANK_ACCOUNT    ||--o{ PAYMENT_MANDATE       : "used in"
    USER            ||--o{ CONTRIBUTION          : "owes"
    CONTRIBUTION    ||--o{ TRANSACTION           : "paid via"
    PAYMENT_MANDATE ||--o{ TRANSACTION           : "charged through"
    USER            ||--o| NOTIFICATION_PREFERENCE : "configures"
    USER            ||--o{ NOTIFICATION          : "receives"
    NOTIFICATION_TEMPLATE ||--o{ NOTIFICATION   : "templates"
    USER            ||--o{ AUDIT_LOG             : "generates"
    GOAL            ||--o{ GOAL_PROGRESS         : "tracked by"
    USER            ||--o{ GOAL                  : "locks"
```

---

## Normalisation Proof

### First Normal Form (1NF)
- All attributes are atomic (no multi-valued columns)
- `address` is stored as JSONB — this is a deliberate denormalisation for a composite value that is never queried by individual field. Acceptable per design decision.
- `gatewayResponse` is stored as JSONB — external API response, not queried. Correct.

### Second Normal Form (2NF)
- The only composite primary key is `USER_ROLE(userId, roleId)` — all non-key columns depend on the full composite key. ✓
- All other tables use surrogate UUID PKs — 2NF is trivially satisfied. ✓

### Third Normal Form (3NF)
- No transitive dependencies:
  - Bank details (`bankName`, `accountNumber`, `branchCode`) live in `BANK_ACCOUNT`, not embedded in `PAYMENT_MANDATE`
  - User name fields live in `USER`, not repeated in `CONTRIBUTION` or `TRANSACTION`
  - Period labels (month/year) are integers in `CONTRIBUTION` — no derived columns
  - `currentAmount` in `GOAL` is a cached aggregate. Updated via service layer on every `GOAL_PROGRESS` insert. This is an intentional denormalisation for read performance — documented here.

---

## Key Constraints

| Table | Constraint | Rule |
|---|---|---|
| `CONTRIBUTION` | UNIQUE(userId, periodMonth, periodYear) | One contribution record per member per period |
| `TRANSACTION` | UNIQUE(idempotencyKey) | Prevents double-processing on retry |
| `NOTIFICATION_PREFERENCE` | UNIQUE(userId) | One preference record per member |
| `PAYMENT_MANDATE` | FK ON DELETE RESTRICT | Cannot delete user with active mandate |
| `CONTRIBUTION` | FK ON DELETE RESTRICT | Cannot delete user with contribution history |
| `TRANSACTION` | No hard delete | Reversals only — financial audit trail is permanent |
| `BANK_ACCOUNT` | FK ON DELETE CASCADE from USER | Account removed with user (soft-delete path) |

---

## Encryption Details

The following columns are encrypted at the application layer (before Prisma write) using AES-256-GCM:

| Table | Column | Reason |
|---|---|---|
| `USER` | `idNumber` | SA ID — sensitive PII |
| `BANK_ACCOUNT` | `accountNumber` | Financial PII |

Encryption key sourced from `ENCRYPTION_KEY` env var (32-byte hex string).  
Decryption happens in the service layer only — never in API route handlers directly.
