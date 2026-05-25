# Xkimm Xa Mali — System Design v1.0

> "Blessed is the hand that giveth… It is more blessed to give than to receive." — Acts 20:35

---

## System Classification

| Attribute | Decision |
|---|---|
| **System Name** | Xkimm Xa Mali (XXM) |
| **Problem Domain** | Family savings group — contribution management, automated payments, financial tracking |
| **User Classes** | Admin (founder, dual role), Members/Contributors |
| **Scale Target** | 4–50 members, <1000 req/day initially |
| **Data Sensitivity** | Financial + PII — highest classification |
| **Platform Target** | Web (PWA-capable, mobile-first) |
| **Existing Systems** | WhatsApp group (communication), SA banking (debit orders) |

```
Framework:    Next.js App Router  (public-facing + member portal, SEO homepage, PWA)
Database:     PostgreSQL via Prisma  (ACID compliance — non-negotiable for financial data)
Auth:         NextAuth.js + JWT HTTP-only cookies
Payment:      Netcash  (SA-native DebiCheck/NAEDO debit order management)
SMS:          BulkSMS  (leading SA provider, zero-rating eligible)
Email:        Resend  (transactional, developer-first)
Jobs/Cron:    Inngest  (durable, retryable, event-driven — critical for payment pipeline)
Cache/Rate:   Upstash Redis
Deployment:   Vercel (Next.js) + Neon (PostgreSQL) + Upstash (Redis)
Storage:      Vercel Blob  (statement PDFs)
Monitoring:   Sentry + Better Stack
```

**Why Netcash over PayFast:** Netcash is purpose-built for recurring debit order management in SA. It supports DebiCheck authenticated mandates, NAEDO, and batch collections. PayFast is optimised for once-off e-commerce.

**Why Inngest over Vercel Cron:** The notification + payment pipeline requires durable, retryable, event-driven jobs with full execution history and backoff. Vercel Cron fires and forgets with no retry guarantees.

**Why Neon over Supabase:** Neon provides database branching (staging gets its own DB branch, not a shared instance) and serverless scale-to-zero for cost efficiency at this scale.

---

## Phase 0 — Domain Modelling

### Bounded Contexts

```
┌─────────────────────────────────────────────────────────────────┐
│                        XXM Platform                             │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐   │
│  │   IDENTITY   │   │  MEMBERSHIP  │   │  CONTRIBUTIONS   │   │
│  │              │   │              │   │                  │   │
│  │ Users        │   │ Profiles     │   │ Contribution     │   │
│  │ Roles        │   │ BankAccounts │   │ records          │   │
│  │ Sessions     │   │ Mandates     │   │ Payment cycles   │   │
│  └──────┬───────┘   └──────┬───────┘   └────────┬─────────┘   │
│         │                  │                     │              │
│  ┌──────▼──────────────────▼─────────────────────▼─────────┐  │
│  │                    PAYMENTS                               │  │
│  │   Transactions · Gateway integration · Webhooks          │  │
│  └──────────────────────────┬────────────────────────────────┘  │
│                             │                                   │
│  ┌──────────────┐   ┌───────▼──────┐   ┌──────────────────┐   │
│  │   GOALS      │   │NOTIFICATIONS │   │   COMMUNITY      │   │
│  │              │   │              │   │                  │   │
│  │ Group goals  │   │ SMS/Email    │   │ WhatsApp link    │   │
│  │ Progress     │   │ Push         │   │ Announcements    │   │
│  │ Locking      │   │ Templates    │   │ Group info       │   │
│  └──────────────┘   └──────────────┘   └──────────────────┘   │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐                          │
│  │  REPORTING   │   │   ADMIN      │                          │
│  │              │   │              │                          │
│  │ Statements   │   │ Dashboard    │                          │
│  │ Exports      │   │ Audit logs   │                          │
│  └──────────────┘   └──────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

**Context boundary rules:**
- No context reads directly from another context's DB tables — all cross-context data is accessed via service interfaces
- Payment context owns all transaction state; Contributions context holds only contribution records (amounts, status) and calls Payment service for processing
- Notifications context is a subscriber to events from Contributions + Payments — never called inline

### Entity Relationships (Summary)

```
User ──< UserRole >── Role
User ──< BankAccount
User ──< PaymentMandate ──> BankAccount
User ──< Contribution
Contribution ──< Transaction ──> PaymentMandate
User ──< Notification ──> NotificationTemplate
Goal ──< GoalProgress
User ──< AuditLog
```

### Data Classification

| Entity | Class | Encryption at rest |
|---|---|---|
| Email, phone | PII | No (indexed, hashed for lookup) |
| SA ID number | Sensitive PII | Yes — AES-256 |
| Bank account number | Financial PII | Yes — AES-256 |
| Bank branch code | Low sensitivity | No |
| Transaction amounts | Financial | No (access-controlled) |
| Passwords | Credentials | bcrypt cost 12 |
| Session tokens | Credentials | HTTP-only cookie |

---

## Phase 1 — System Architecture

### Component Diagram

```
                        ┌─────────────────────────────────┐
                        │         VERCEL EDGE              │
                        │   (CDN + Middleware + WAF)       │
                        └────────────────┬────────────────┘
                                         │
                        ┌────────────────▼────────────────┐
                        │       NEXT.JS APP ROUTER         │
                        │                                  │
                        │  ┌───────────┐ ┌─────────────┐  │
                        │  │  Public   │ │   Member    │  │
                        │  │  Routes   │ │   Portal    │  │
                        │  │ /home     │ │ /dashboard  │  │
                        │  │ /whatsapp │ │ /contribute │  │
                        │  └───────────┘ └─────────────┘  │
                        │  ┌───────────┐ ┌─────────────┐  │
                        │  │   Admin   │ │  API Routes │  │
                        │  │  /admin/* │ │  /api/v1/*  │  │
                        │  └───────────┘ └──────┬──────┘  │
                        └─────────────────────── │ ────────┘
                                                 │
              ┌──────────────────────────────────┼──────────────────┐
              │                                  │                  │
   ┌──────────▼──────────┐           ┌───────────▼───────┐  ┌──────▼──────┐
   │   NEON POSTGRESQL    │           │   UPSTASH REDIS   │  │   INNGEST   │
   │   (via Prisma ORM)  │           │  Rate limiting    │  │  Job engine │
   │                     │           │  Idempotency keys │  │             │
   │  users              │           │  Session cache    │  │  DebitRun   │
   │  contributions      │           └───────────────────┘  │  MorningMsg │
   │  transactions       │                                   │  OverdueMsg │
   │  goals              │                                   │  PayResult  │
   │  notifications      │                                   └──────┬──────┘
   └─────────────────────┘                                          │
                                                                    │
              ┌─────────────────────────────────────────────────────┼──┐
              │                          │                          │  │
   ┌──────────▼──────────┐   ┌───────────▼───────┐   ┌────────────▼──┐│
   │      NETCASH         │   │     BULKSMS       │   │    RESEND     ││
   │  (Debit orders)     │   │  (SMS notifs)     │   │   (Email)     ││
   │  DebiCheck mandate  │   │  Zero-rated path  │   │  Transactional││
   │  NAEDO collections  │   └───────────────────┘   └───────────────┘│
   │  Webhook callbacks  │                                             │
   └─────────────────────┘                              ┌─────────────┘
                                                        │
                                             ┌──────────▼──────────┐
                                             │    VERCEL BLOB      │
                                             │  Statement PDFs     │
                                             │  Profile images     │
                                             └─────────────────────┘
```

### Data Flow — Monthly Debit Run

```
[Inngest Cron — 07:00 daily]
      │
      ▼
Check mandates with debit_day = today
      │
      ├── For each matched mandate:
      │         │
      │         ▼
      │   Send morning warning SMS via BulkSMS
      │   "Tonight at 20:00 we will deduct R{amount}. 
      │    Reply DELAY to postpone."
      │
[Inngest Event — 20:00]
      │
      ▼
For each mandate with no DELAY response:
      │
      ▼
Create Transaction record (status: pending)
      │
      ▼
Submit to Netcash DebiCheck API
      │
      ▼
Netcash processes → Webhook callback
      │
      ├── SUCCESS → Update Transaction (paid)
      │              Update Contribution (paid)
      │              Send confirmation SMS + Email
      │
      └── DECLINED → Update Transaction (failed)
                     Update Contribution (overdue)
                     Trigger daily overdue reminder job
                     (fires once/day until paid or month-end)
```

### Integration Surface

| External System | Direction | Protocol | Purpose |
|---|---|---|---|
| Netcash | Outbound + Inbound webhook | HTTPS REST | Debit order submission + result |
| BulkSMS | Outbound | HTTPS REST | SMS delivery |
| Resend | Outbound | HTTPS REST | Email delivery |
| Inngest | Bidirectional | HTTPS webhook | Job scheduling and execution |
| SA Banks | Via Netcash | DebiCheck/NAEDO | Actual money movement |
| WhatsApp | Link only | Deep link URL | Group redirection |

---

## Phase 2 — Database Design

### Full Schema

See `docs/erd.md` for the entity diagram.

```prisma
// Core identity
model User {
  id         String   @id @default(cuid())
  email      String   @unique
  phone      String   @unique
  firstName  String
  lastName   String
  idNumber   String?  // encrypted
  address    Json?
  status     UserStatus @default(PENDING)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  roles              UserRole[]
  bankAccounts       BankAccount[]
  mandates           PaymentMandate[]
  contributions      Contribution[]
  notifications      Notification[]
  auditLogs          AuditLog[]
  lockedGoals        Goal[]           @relation("GoalLocker")
}

model Role {
  id    String   @id @default(cuid())
  name  RoleName @unique
  users UserRole[]
}

model UserRole {
  userId String
  roleId String
  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role   Role @relation(fields: [roleId], references: [id], onDelete: Restrict)
  @@id([userId, roleId])
}

model BankAccount {
  id            String   @id @default(cuid())
  userId        String
  bankName      String
  accountNumber String   // encrypted at application layer
  accountType   AccountType
  branchCode    String
  isPrimary     Boolean  @default(false)
  verifiedAt    DateTime?
  createdAt     DateTime @default(now())

  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  mandates  PaymentMandate[]
}

model PaymentMandate {
  id               String         @id @default(cuid())
  userId           String
  bankAccountId    String
  debitDay         Int            // 1–28
  amount           Decimal        @db.Decimal(10, 2) // minimum R100
  status           MandateStatus  @default(PENDING)
  netcashMandateId String?        // external reference
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt

  user         User          @relation(fields: [userId], references: [id], onDelete: Restrict)
  bankAccount  BankAccount   @relation(fields: [bankAccountId], references: [id], onDelete: Restrict)
  transactions Transaction[]
}

model Contribution {
  id           String             @id @default(cuid())
  userId       String
  periodMonth  Int
  periodYear   Int
  amountDue    Decimal            @db.Decimal(10, 2)
  amountPaid   Decimal            @default(0) @db.Decimal(10, 2)
  dueDate      DateTime
  status       ContributionStatus @default(PENDING)
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt

  user         User          @relation(fields: [userId], references: [id], onDelete: Restrict)
  transactions Transaction[]

  @@unique([userId, periodMonth, periodYear])
  @@index([status, dueDate])
}

model Transaction {
  id               String            @id @default(cuid())
  contributionId   String
  mandateId        String
  amount           Decimal           @db.Decimal(10, 2)
  type             TransactionType
  status           TransactionStatus @default(PENDING)
  gatewayRef       String?
  gatewayResponse  Json?
  idempotencyKey   String            @unique
  processedAt      DateTime?
  createdAt        DateTime          @default(now())

  contribution Contribution   @relation(fields: [contributionId], references: [id])
  mandate      PaymentMandate @relation(fields: [mandateId], references: [id])

  @@index([status, createdAt])
  @@index([gatewayRef])
}

model Goal {
  id            String     @id @default(cuid())
  type          GoalType
  title         String
  description   String?
  targetAmount  Decimal    @db.Decimal(10, 2)
  currentAmount Decimal    @default(0) @db.Decimal(10, 2)
  deadline      DateTime
  status        GoalStatus @default(DRAFT)
  lockedAt      DateTime?
  lockedById    String?
  createdAt     DateTime   @default(now())
  updatedAt     DateTime   @updatedAt

  lockedBy GoalProgress[] 
  locker   User?          @relation("GoalLocker", fields: [lockedById], references: [id])
}

model GoalProgress {
  id         String   @id @default(cuid())
  goalId     String
  amount     Decimal  @db.Decimal(10, 2)
  recordedAt DateTime @default(now())

  goal Goal @relation(fields: [goalId], references: [id])
}

model NotificationTemplate {
  id      String          @id @default(cuid())
  slug    String          @unique
  channel NotifChannel
  body    String          // {{variable}} placeholders

  notifications Notification[]
}

model Notification {
  id         String       @id @default(cuid())
  userId     String
  templateId String
  channel    NotifChannel
  status     NotifStatus  @default(QUEUED)
  payload    Json
  sentAt     DateTime?
  createdAt  DateTime     @default(now())

  user     User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  template NotificationTemplate @relation(fields: [templateId], references: [id])

  @@index([userId, createdAt])
  @@index([status])
}

model NotificationPreference {
  id      String  @id @default(cuid())
  userId  String  @unique
  sms     Boolean @default(true)
  email   Boolean @default(true)
  push    Boolean @default(true)
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String?
  action    String
  entity    String
  entityId  String
  payload   Json
  ipAddress String?
  createdAt DateTime @default(now())

  user User? @relation(fields: [userId], references: [id])

  @@index([entity, entityId])
  @@index([userId, createdAt])
}

// Enums
enum UserStatus       { PENDING ACTIVE SUSPENDED }
enum RoleName         { ADMIN MEMBER }
enum AccountType      { SAVINGS CHEQUE TRANSMISSION }
enum MandateStatus    { PENDING ACTIVE SUSPENDED CANCELLED }
enum ContributionStatus { PENDING PARTIAL PAID OVERDUE WAIVED }
enum TransactionType  { DEBIT_ORDER MANUAL REVERSAL }
enum TransactionStatus { PENDING PROCESSING SUCCESS FAILED REVERSED }
enum GoalType         { MONTHLY YEARLY CUSTOM }
enum GoalStatus       { DRAFT ACTIVE ACHIEVED FAILED }
enum NotifChannel     { SMS EMAIL PUSH }
enum NotifStatus      { QUEUED SENT FAILED }
```

### Normalisation Proof

All tables are in **3NF**:
- 1NF: All columns are atomic; no repeating groups
- 2NF: All non-key columns depend on the full primary key (composite PKs in junction tables)
- 3NF: No transitive dependencies (e.g. bank details live in `BankAccount`, not embedded in `PaymentMandate`)

### Index Strategy

```
contributions(status, dueDate)      — debit run query
transactions(status, createdAt)     — reporting queries
transactions(gatewayRef)            — webhook lookup
notifications(userId, createdAt)    — inbox queries
notifications(status)               — retry job
audit_logs(entity, entityId)        — audit trail
audit_logs(userId, createdAt)       — user activity
```

---

## Phase 3 — API Contract

Base path: `/api/v1/`
Full OpenAPI spec: `docs/api-contract.yaml`

### Endpoint Summary

**Auth**
```
POST   /api/v1/auth/register          Public     — register new member
POST   /api/v1/auth/login             Public     — login
POST   /api/v1/auth/logout            Auth       — logout
GET    /api/v1/auth/me                Auth       — current user + roles
PATCH  /api/v1/auth/password          Auth       — change password
POST   /api/v1/auth/forgot-password   Public     — initiate reset
POST   /api/v1/auth/reset-password    Public     — complete reset
```

**Members**
```
GET    /api/v1/members                Admin      — list all members
GET    /api/v1/members/:id            Auth       — get profile (own or admin)
PATCH  /api/v1/members/:id            Auth       — update profile
GET    /api/v1/members/:id/summary    Auth       — contribution summary
```

**Bank Accounts**
```
GET    /api/v1/bank-accounts          Auth       — own accounts
POST   /api/v1/bank-accounts          Auth       — add account
PATCH  /api/v1/bank-accounts/:id      Auth       — update (pre-verification only)
DELETE /api/v1/bank-accounts/:id      Auth       — remove (no active mandate)
```

**Payment Mandates**
```
GET    /api/v1/mandates               Auth       — own mandates
POST   /api/v1/mandates               Auth       — create debit mandate
PATCH  /api/v1/mandates/:id           Auth       — update debit day / amount
DELETE /api/v1/mandates/:id           Auth       — cancel mandate
POST   /api/v1/mandates/:id/delay     Auth       — request payment delay
```

**Contributions**
```
GET    /api/v1/contributions          Auth       — own history (admin: all)
GET    /api/v1/contributions/:id      Auth       — single record
POST   /api/v1/contributions/manual   Auth       — manual early payment
```

**Transactions**
```
GET    /api/v1/transactions           Auth       — own history (admin: all)
GET    /api/v1/transactions/:id       Auth       — single record
GET    /api/v1/transactions/statement Auth       — download PDF (Blob URL)
```

**Goals**
```
GET    /api/v1/goals                  Auth       — active + past goals
POST   /api/v1/goals                  Admin      — create goal
GET    /api/v1/goals/:id              Auth       — goal detail + progress
PATCH  /api/v1/goals/:id              Admin      — update goal
POST   /api/v1/goals/:id/lock         Admin      — lock goal (irreversible)
```

**Notifications**
```
GET    /api/v1/notifications          Auth       — own notifications
GET    /api/v1/notifications/preferences  Auth   — get preferences
PATCH  /api/v1/notifications/preferences  Auth   — update preferences
```

**Admin**
```
GET    /api/v1/admin/dashboard        Admin      — aggregated stats
GET    /api/v1/admin/reports          Admin      — financial reports
POST   /api/v1/admin/members/:id/suspend   Admin — suspend member
POST   /api/v1/admin/members/:id/activate  Admin — reactivate member
GET    /api/v1/admin/audit-logs       Admin      — audit log
```

**Webhooks** (signature-verified, no auth cookie)
```
POST   /api/v1/webhooks/netcash       System     — payment result callback
POST   /api/v1/webhooks/bulksms       System     — SMS delivery receipt
POST   /api/v1/webhooks/inngest       System     — Inngest job events
```

### Standard Response Envelope

```typescript
// Success
{
  data: T,
  meta: {
    requestId: string,
    timestamp: string,
    pagination?: { page, limit, total, totalPages }
  }
}

// Error
{
  error: {
    code: string,      // e.g. "CONTRIBUTION_NOT_FOUND"
    message: string,   // human-readable
    traceId: string
  }
}
```

### Zod Validation — Key Schemas

```typescript
// All schemas live in apps/web/lib/validation/

const RegisterSchema = z.object({
  email: z.string().email(),
  phone: z.string().regex(/^(\+27|0)[6-8][0-9]{8}$/),  // SA mobile
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  idNumber: z.string().regex(/^\d{13}$/),  // SA ID
  password: z.string().min(8).regex(/^(?=.*[A-Z])(?=.*[0-9])/),
})

const CreateMandateSchema = z.object({
  bankAccountId: z.string().cuid(),
  debitDay: z.number().int().min(1).max(28),
  amount: z.number().min(100),  // R100 minimum
})

const ManualContributionSchema = z.object({
  amount: z.number().min(100),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2024),
})
```

---

## Phase 4 — Security Model

See `docs/security-model.md` for full detail.

### Permission Tiers

| Level | Name | Access |
|---|---|---|
| L0 | Public | Homepage, WhatsApp page, auth pages only |
| L1 | Member | Own profile, own contributions, own transactions, own mandates, goals (read) |
| L2 | Admin | All member data, all transactions, goal management, reports, audit logs |
| L3 | System | Webhook endpoints, internal job endpoints — no UI |

### L4 Hard Blocks (immutable, no override)

```
- Members cannot view other members' bank account numbers
- Members cannot view other members' SA ID numbers  
- Members cannot view other members' transaction amounts
- Members cannot modify their own Transaction or Contribution records directly
- Admin cannot permanently delete Transaction records — only reverse
- Webhook endpoints cannot be accessed with a user session cookie
- No endpoint bypasses Zod input validation
```

### Auth Strategy

```
Registration:  Email + SA phone → email verification required
Login:         Email + password → HTTP-only cookie (7-day, SameSite=Strict)
Admin routes:  Role check middleware on every request
API routes:    Session check → role check → resource ownership check
Webhooks:      HMAC-SHA256 signature verification (Netcash secret, Inngest signing key)
Rate limiting: 5 req/min auth endpoints, 60 req/min all others (per IP, via Upstash)
```

### POPIA Compliance (SA Data Protection)

```
- Consent tracked at registration with timestamp
- Data export endpoint: GET /api/v1/members/:id/export (zip of all user data)
- Data deletion: soft-delete + 90-day hard purge (financial records retained 5 years)
- Privacy policy page required (public)
- No data sharing with third parties beyond payment processor
```

---

## Phase 5 — Infrastructure & Observability

### Environments

| Environment | Next.js | Database | Redis | Notes |
|---|---|---|---|---|
| Local | localhost:3000 | Docker PostgreSQL | Docker Redis | `docker-compose up` |
| Preview | Vercel preview | Neon branch | Upstash free | Auto on every PR |
| Production | Vercel pro | Neon pro | Upstash pro | Tagged releases |

### Service Health

```
Every service exposes:
  GET /api/health  →  { status: "ok", db: "ok", redis: "ok", ts: "..." }
```

### Monitoring Stack

| Tool | Purpose |
|---|---|
| Sentry | Error tracking, performance, release tracking |
| Better Stack | Uptime monitoring, on-call alerts |
| Vercel Analytics | Core Web Vitals, page performance |
| Inngest dashboard | Job history, failure rates, retries |

### CI/CD Pipeline

```
On Pull Request:
  1. Type check (tsc --noEmit)
  2. Lint (ESLint)
  3. Unit + integration tests (Vitest)
  4. Prisma schema validate
  5. Vercel preview deploy

On merge to main:
  1. All PR checks
  2. Deploy to production (Vercel)
  3. Prisma migrate deploy (Neon)
  4. Sentry release notification
```

### Zero-Rating / Data-Free Strategy

SA operator zero-rating requires formal application to Vodacom/MTN/Cell C/Telkom. Steps:
1. Register domain and apply to each operator's zero-rating portal
2. Keep API responses minimal (no images in API responses)
3. PWA service worker caches static assets — repeat visits use zero data
4. All images served via Vercel CDN with aggressive caching
5. Compress all responses (gzip/brotli — Vercel default)

---

## Phase 6 — Sequential Build Plan

See `docs/build-order.md` for full detail.

### Module Dependency Order

```
M01  Project Foundation         (no deps)
  └── M02  Auth System          (M01)
        └── M03  Member Profile (M02)
              ├── M04  Payment Mandates  (M03)
              │     └── M05  Contribution Engine  (M04)
              │           └── M06  Job Engine (Inngest)  (M05)
              │                 └── M07  Notification System  (M06)
              │                       └── M09  Reporting & Statements (M05, M07)
              └── M08  Goals System  (M03)
                        └── M10  WhatsApp Integration Page  (M01)
                              └── M11  Admin Dashboard  (M02–M10)
                                    └── M12  PWA + Optimisation  (M11)
```

No module starts before its dependency is complete. This is enforced in GitHub Projects.

---

## Recommendations & Improvements

### Added to Design

1. **Idempotency keys on all transactions** — prevents double-debit if Inngest retries. Every `Transaction` record has a `idempotencyKey` (UUID v4, stored in Redis for 48h).

2. **DELAY/postpone flow** — user replies DELAY to morning SMS or selects new date in portal. System stores a `PaymentDelay` against the mandate for that cycle and reschedules the Inngest event.

3. **Partial payments** — `amountPaid` on `Contribution` allows partial settlement. Status becomes `PARTIAL` until `amountPaid >= amountDue`.

4. **Group WhatsApp page** — static page with group info, rules, and a WhatsApp deep link (`https://wa.me/...`). No external API required.

5. **Statement PDF generation** — uses `@react-pdf/renderer` server-side. Stored in Vercel Blob, signed URL returned with 15-min expiry.

6. **Audit log on every state change** — every write operation through service layer logs to `AuditLog`. Admin can view full history per member or per entity.

7. **Data-driven roles** — roles live in DB. Adding a new role = seed record + permission entries, not a code change. [EXT-E03]

8. **Feature flags via env vars** — `ENABLE_MANUAL_PAYMENTS`, `ENABLE_GOAL_LOCKING` etc. Toggle features without deploys.

9. **POPIA data export** — `/api/v1/members/:id/export` bundles all user data as a zip. Required by SA law.

10. **Luhn + modulus-10 validation** — SA bank account numbers and ID numbers validated client-side AND server-side before submission to Netcash.
