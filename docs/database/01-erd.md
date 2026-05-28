# Entity Relationship Diagram

| | |
|---|---|
| **Purpose** | Complete visual map of every table, relationship, cardinality, and key constraint in the database |
| **Schema file** | `packages/database/prisma/schema.prisma` |
| **Migration** | `packages/database/prisma/migrations/20241201000000_initial_schema` |
| **Tables** | 14 current + 1 planned (Invitation — M11a) |
| **Related Docs** | [02-normalization.md](./02-normalization.md) · [03-schema-design.md](./03-schema-design.md) · [../architecture/03-component-architecture.md](../architecture/03-component-architecture.md) |

---

## Diagram 1 — Full ERD by Domain Layer

> Every table grouped by domain. Arrows show foreign key direction (child points to parent).

```mermaid
flowchart TD
    subgraph IDENTITY["Identity and Auth Layer"]
        users["USERS\npk: id\nemail UK\nphone UK\nfirstName, lastName\nidNumber — encrypted\naddress JSON\npassword — bcrypt\nstatus PENDING ACTIVE SUSPENDED\npopiaConsentAt\ncreatedAt, updatedAt"]

        roles["ROLES\npk: id\nname UK\nADMIN or MEMBER"]

        user_roles["USER_ROLES\npk: userId + roleId\ncomposite primary key"]

        accounts["ACCOUNTS\npk: id\nprovider UK with providerAccountId\nNextAuth OAuth adapter"]

        sessions["SESSIONS\npk: id\nsessionToken UK\nexpires"]

        prt["PASSWORD_RESET_TOKENS\npk: id\ntokenHash UK\nexpiresAt\nusedAt nullable"]

        evt["EMAIL_VERIFICATION_TOKENS\npk: id\ntokenHash UK\nexpiresAt\nusedAt nullable"]
    end

    subgraph BANKING["Banking Layer"]
        bank_accounts["BANK_ACCOUNTS\npk: id\nbankName\naccountNumber — encrypted\naccountType SAVINGS CHEQUE TRANSMISSION\nbranchCode\nisPrimary boolean\nverifiedAt nullable"]

        payment_mandates["PAYMENT_MANDATES\npk: id\ndebitDay int 1 to 28\namount Decimal 10,2\nstatus PENDING ACTIVE SUSPENDED CANCELLED\nnetcashMandateId nullable\ncreatedAt, updatedAt"]
    end

    subgraph CONTRIB_LAYER["Contributions and Transactions Layer"]
        contributions["CONTRIBUTIONS\npk: id\nperiodMonth int\nperiodYear int\namountDue Decimal 10,2\namountPaid Decimal 10,2 default 0\ndueDate\nstatus PENDING PARTIAL PAID OVERDUE WAIVED\nUNIQUE userId + periodMonth + periodYear\ncreatedAt, updatedAt"]

        transactions["TRANSACTIONS\npk: id\namount Decimal 10,2\ntype DEBIT_ORDER MANUAL REVERSAL\nstatus PENDING PROCESSING SUCCESS FAILED REVERSED\ngatewayRef nullable\ngatewayResponse JSON nullable\nidempotencyKey UK\nprocessedAt nullable\ncreatedAt"]
    end

    subgraph GOALS_LAYER["Goals Layer"]
        goals["GOALS\npk: id\ntype MONTHLY YEARLY CUSTOM\ntitle\ndescription nullable\ntargetAmount Decimal 10,2\ncurrentAmount Decimal 10,2 default 0\ndeadline\nstatus DRAFT ACTIVE ACHIEVED FAILED\nlockedAt nullable\nlockedById nullable FK\ncreatedAt, updatedAt"]

        goal_progress["GOAL_PROGRESS\npk: id\namount Decimal 10,2\nrecordedAt"]
    end

    subgraph NOTIF_LAYER["Notification Layer"]
        notif_templates["NOTIFICATION_TEMPLATES\npk: id\nslug UK\nchannel SMS EMAIL PUSH\nbody — template string with placeholders"]

        notifications["NOTIFICATIONS\npk: id\nchannel SMS EMAIL PUSH\nstatus QUEUED SENT FAILED\npayload JSON\nsentAt nullable\ncreatedAt\nINDEX userId + createdAt\nINDEX status"]

        notif_prefs["NOTIFICATION_PREFERENCES\npk: id\nuserId UK one per user\nsms boolean default true\nemail boolean default true\npush boolean default true"]
    end

    subgraph AUDIT_LAYER["Audit Layer"]
        audit_logs["AUDIT_LOGS\npk: id\naction text\nentity text\nentityId text\npayload JSON\nipAddress nullable\ncreatedAt\nINDEX entity + entityId\nINDEX userId + createdAt"]
    end

    subgraph M11A_LAYER["M11a — Invitation Layer — PENDING IMPLEMENTATION"]
        invitations["INVITATIONS\npk: id\ncodeHash UK\ncodePrefix 4 chars for display\nfirstName, lastName\nemail UK — binding\nphone UK — binding\nminimumAmount Decimal 10,2\nstatus PENDING ACCEPTED REVOKED EXPIRED\nexpiresAt createdAt plus 7 days\nacceptedAt nullable\ncreatedAt"]
    end

    users --> user_roles
    roles --> user_roles
    users --> accounts
    users --> sessions
    users --> prt
    users --> evt
    users --> bank_accounts
    users --> payment_mandates
    bank_accounts --> payment_mandates
    users --> contributions
    payment_mandates --> transactions
    contributions --> transactions
    users --> goals
    goals --> goal_progress
    users --> notifications
    notif_templates --> notifications
    users --> notif_prefs
    users --> audit_logs
    users -->|"invitedBy"| invitations
    users -.->|"acceptedBy — nullable\nset when member registers"| invitations
```

---

## Diagram 2 — Cardinality Map

> Shows the exact one-to-one, one-to-many, and many-to-many relationships between entities.

```mermaid
flowchart LR
    subgraph ONETOMANY["One to Many"]
        OM1["1 User has many BankAccounts"]
        OM2["1 User has many PaymentMandates"]
        OM3["1 User has many Contributions"]
        OM4["1 User has many Notifications"]
        OM5["1 User has many AuditLogs"]
        OM6["1 User has many PasswordResetTokens"]
        OM7["1 BankAccount backs many PaymentMandates"]
        OM8["1 PaymentMandate produces many Transactions"]
        OM9["1 Contribution is settled by many Transactions"]
        OM10["1 Goal has many GoalProgress records"]
        OM11["1 NotificationTemplate renders many Notifications"]
    end

    subgraph ONETOONE["One to One or Optional"]
        OO1["1 User has 0 or 1 NotificationPreference\nautomatically created on registration"]
        OO2["1 Invitation accepted by 0 or 1 User\nnullable acceptedById"]
        OO3["1 Goal locked by 0 or 1 User\nnullable lockedById"]
    end

    subgraph MANYTOMANY["Many to Many via Junction"]
        MM1["User to Role\nvia UserRole junction table\none user can have ADMIN and MEMBER"]
    end
```

---

## Diagram 3 — Key Constraint Index Map

> Every index and unique constraint and why it exists.

```mermaid
flowchart TD
    subgraph UNIQUE_CONSTRAINTS["Unique Constraints"]
        U1["users.email\nprevents duplicate accounts"]
        U2["users.phone\nprevents duplicate SA phone numbers"]
        U3["roles.name\nonly one ADMIN role, one MEMBER role"]
        U4["sessions.sessionToken\nNextAuth session lookup key"]
        U5["password_reset_tokens.tokenHash\nfail fast on duplicate token"]
        U6["email_verification_tokens.tokenHash\nfail fast on duplicate token"]
        U7["bank_accounts.accountNumber — no unique\none user can have multiple accounts\nencrypted so cannot index directly"]
        U8["contributions.userId + periodMonth + periodYear\none contribution record per member per month"]
        U9["transactions.idempotencyKey\nblocks double-charge on retry"]
        U10["notification_templates.slug\nlookup by well-known name"]
        U11["notification_preferences.userId\none preference record per member"]
    end

    subgraph PERFORMANCE_INDEXES["Performance Indexes"]
        PI1["contributions.status + dueDate\noverdue detection query — daily job"]
        PI2["transactions.status + createdAt\ndashboard stats query"]
        PI3["transactions.gatewayRef\nwebhook deduplication lookup"]
        PI4["notifications.userId + createdAt\nmember inbox pagination"]
        PI5["notifications.status\ndelivery queue flush worker"]
        PI6["audit_logs.entity + entityId\nevent trace by entity"]
        PI7["audit_logs.userId + createdAt\nuser activity timeline"]
        PI8["password_reset_tokens.userId\nclean up expired tokens per user"]
        PI9["email_verification_tokens.userId\nclean up expired tokens per user"]
    end
```

---

## Diagram 4 — Encrypted Fields

> Identifies every field protected by AES-256-GCM application-layer encryption.

```mermaid
flowchart LR
    subgraph ENC["AES-256-GCM Encrypted at Application Layer"]
        E1["users.idNumber\nSA ID number\n13-digit national identity\nHigh sensitivity PII"]
        E2["bank_accounts.accountNumber\nSA bank account number\nFinancial credential\nHigh sensitivity PII"]
    end

    subgraph NOT_ENC["Stored in Plain Text — Intentional"]
        N1["users.email\nIndexed and looked up by email\nEncryption would break auth flow"]
        N2["users.phone\nIndexed and looked up for SMS\nEncryption would break lookup"]
        N3["bank_accounts.bankName\nNot sensitive — public knowledge"]
        N4["bank_accounts.branchCode\nNot sensitive — public knowledge"]
        N5["contributions and transactions\nAmounts are not PII\nRequired for reporting and auditing"]
    end

    subgraph ENC_FLOW["Encryption Key Management"]
        EK1["ENCRYPTION_KEY env var\n64 hex chars — 32 bytes\nAES-256 key size"]
        EK2["lib/encryption.ts\nencrypt() and decrypt()\nAES-256-GCM with random IV per value"]
        EK3["IV stored with ciphertext\nformat: iv:authTag:ciphertext base64\nEach value has unique IV"]
    end

    EK1 --> EK2 --> E1
    EK2 --> E2
```

---

## Table Reference

| Table | Rows at Scale | Primary Access Pattern | Notes |
|---|---|---|---|
| `users` | 4 to 50 | By email, by id | Core identity record |
| `roles` | 2 (fixed) | By name | ADMIN, MEMBER only |
| `user_roles` | 4 to 100 | By userId | Founder has 2 rows |
| `accounts` | 4 to 50 | By userId | NextAuth OAuth — credentials provider only for now |
| `sessions` | Varies | By sessionToken | JWT strategy — rows minimal |
| `password_reset_tokens` | Low | By tokenHash | Cleaned up after use |
| `email_verification_tokens` | Low | By tokenHash | Cleaned up after use |
| `bank_accounts` | 4 to 150 | By userId | 1 to 3 accounts per member |
| `payment_mandates` | 4 to 50 | By userId, by status | One active per member at a time |
| `contributions` | Up to 600/year at 50 members | By userId + period, by status | One per member per month |
| `transactions` | Up to 1200/year | By contributionId, by idempotencyKey | Multiple per contribution possible |
| `goals` | 5 to 30 | By status | Admin creates, members view |
| `goal_progress` | Grows with goals | By goalId | Funding history per goal |
| `notification_templates` | 10 to 20 (fixed) | By slug | Seeded, rarely changes |
| `notifications` | High | By userId + createdAt, by status | Inbox history + delivery queue |
| `notification_preferences` | 4 to 50 | By userId | One per member |
| `audit_logs` | Grows continuously | By entity + entityId | Append-only, never deleted |
