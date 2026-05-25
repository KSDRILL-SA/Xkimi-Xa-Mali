# Xkimm Xa Mali — Sequential Build Plan

## Rule

No module starts before every module it depends on is complete and deployed to staging.  
Each module has a definition of done. PR is not merged until DoD is met.

---

## Build Status

| Module | Status | Notes |
|---|---|---|
| M01 Foundation | ✅ Done | |
| M02 Auth | ✅ Done | Will receive patch from M11a |
| M03 Profile | ✅ Done | |
| M04 Mandates | ✅ Merged (PR #7) | |
| M05 Contributions | ✅ Merged (PR #8) | |
| M06 Job Engine | ✅ Built — **PR needed** | Branch `feat/m06-job-engine`. Code review recommended before merge (touches live debit logic) |
| M07 Notifications | ⬜ Next | Unblocks M06 — `queueNotification` stubs go nowhere until templates are seeded |
| M08 Goals | ⬜ | |
| M09 Reporting | ⬜ | |
| M10 WhatsApp page | ⬜ | |
| M11 Admin Dashboard | ⬜ | |
| M11a Invite & Access Control | ⬜ Queued | Builds with M11. Patches M02 register flow + adds admin invite UI. Closes open registration |
| M12 PWA + Optimisation | ⬜ | |

**Progress: 6 of 13 modules complete (~15 of ~30 developer-days)**

---

## Module Dependency Graph

```
M01 Project Foundation
 └── M02 Auth System  ←──────────────────── patched by M11a
       └── M03 Member Profile
             ├── M04 Payment Mandates
             │     └── M05 Contribution Engine
             │           └── M06 Job Engine (Inngest)
             │                 └── M07 Notification System
             │                       └── M09 Reporting & Statements
             └── M08 Goals System
 └── M10 WhatsApp Integration Page (M01 only)
       └── M11 Admin Dashboard (M02–M10)
             └── M11a Invite & Access Control (M11 + M02 patch)
                   └── M12 PWA + Optimisation
```

---

## Module Definitions

### M01 — Project Foundation

**Purpose:** Monorepo scaffold, tooling, local dev environment, base config.

**Deliverables:**
- Turborepo workspace (`apps/web`, `packages/database`)
- Next.js 14 App Router + TypeScript configured
- Prisma schema with all models + migration 001
- Docker Compose: PostgreSQL + Redis
- ESLint + Prettier + Husky pre-commit
- Environment config (`env.ts` with `t3-env` validation)
- `/api/health` endpoint
- GitHub Actions CI skeleton (type-check, lint, test)
- Vercel project linked

**DoD:** `docker-compose up` starts all services; `/api/health` returns 200; CI passes on empty test suite.

---

### M02 — Auth System

**Depends on:** M01

**Purpose:** Secure member registration, login, session, and role enforcement.

**Deliverables:**
- NextAuth.js configured with Prisma adapter
- Registration flow: email + SA phone + SA ID + password
  - Zod schema validation (client + server)
  - SA ID Luhn validation
  - SA phone regex validation
  - bcrypt hashing (cost 12)
  - Email verification via Resend
- Login flow with HTTP-only cookie session
- Password reset flow (no user enumeration)
- Role seed: ADMIN + MEMBER
- Founder seed: admin user with both roles
- Auth middleware (`middleware.ts`) enforcing route tiers L0–L2
- Rate limiting on auth routes (Upstash)

> **Note:** Registration is currently open — any person with a valid SA ID/phone/email can sign up.
> M11a closes this: once built, registration will require a valid invite code. See M11a.

**DoD:** Registration → email verify → login → view dashboard → logout cycle works end-to-end. Role middleware blocks `/admin/*` for member-only session.

---

### M03 — Member Profile

**Depends on:** M02

**Purpose:** Profile management, bank account management, notification preferences.

**Deliverables:**
- Member profile page (`/dashboard/profile`)
- Profile edit form (name, phone, address)
- Bank account add/update/remove (encrypted storage)
  - SA bank account validation (modulus check)
  - Primary account designation
- Notification preferences page
- Member summary API (`/api/v1/members/:id/summary`)
- POPIA data export endpoint (`/api/v1/members/:id/export`)

**DoD:** Member can add a bank account; account number is encrypted in DB; decrypted value only visible to owner.

---

### M04 — Payment Mandates

**Depends on:** M03

**Purpose:** DebiCheck mandate creation and management via Netcash.

**Deliverables:**
- Netcash API client (`lib/netcash.ts`) with typed wrapper
- Mandate creation flow:
  - Select bank account
  - Choose debit day (1–28)
  - Set amount (≥ R100)
  - Submit DebiCheck mandate to Netcash
- Mandate management UI (`/dashboard/mandates`)
- Update debit day / amount (pre-next-cycle)
- Cancel mandate flow
- Delay request (`POST /api/v1/mandates/:id/delay`)
- Netcash webhook handler (`/api/v1/webhooks/netcash`) with HMAC verification

**DoD:** Mandate created in Netcash sandbox; webhook receipt updates mandate status; cancel flow soft-deletes mandate.

---

### M05 — Contribution Engine

**Depends on:** M04

**Purpose:** Monthly contribution records, manual payments, ledger.

**Deliverables:**
- `ContributionService` — creates monthly records, updates status
- Manual payment flow (`/dashboard/contribute`)
  - Select period, enter amount ≥ R100
  - Payment via Netcash once-off charge
- Contribution ledger page (`/dashboard/contributions`)
- Contribution status badge system (PENDING / PARTIAL / PAID / OVERDUE)
- Partial payment support (`amountPaid` accumulation)
- Admin: generate contribution records for all members on month rollover

**DoD:** Manual payment creates Transaction and updates Contribution.amountPaid; PAID status set when amountPaid >= amountDue.

---

### M06 — Job Engine (Inngest)

**Depends on:** M05

**Purpose:** Durable, retryable scheduled jobs for the payment pipeline.

**Deliverables:**
- Inngest client configured (`lib/inngest.ts`)
- Inngest webhook handler (`/api/v1/webhooks/inngest`)
- Jobs:
  1. `xxm/debit.morning-warning` — 07:00 daily; find mandates with debit_day = today; send morning SMS
  2. `xxm/debit.run` — 20:00 daily; for each mandate with no DELAY response; create Transaction; submit to Netcash
  3. `xxm/debit.overdue-reminder` — daily; for each OVERDUE contribution; send reminder SMS (max 1/day)
  4. `xxm/contribution.month-rollover` — 1st of each month; create PENDING contribution records for all active members
  5. `xxm/mandate.delay-handler` — processes DELAY responses; reschedules debit.run event
- Idempotency key generation and Redis storage (48h TTL)

**DoD:** Morning warning job fires at 07:00 (staging); debit.run job creates transaction and calls Netcash; all jobs visible in Inngest dashboard with execution history.

---

### M07 — Notification System

**Depends on:** M06

**Purpose:** SMS, email, and in-app notifications with template system.

**Deliverables:**
- BulkSMS client (`lib/bulksms.ts`)
- Resend client (`lib/resend.ts`)
- `NotificationService` with channel routing
- Notification templates seeded:
  - `morning-warning-sms`
  - `payment-success-sms`
  - `payment-success-email`
  - `payment-failed-sms`
  - `overdue-reminder-sms`
  - `overdue-reminder-email`
  - `welcome-email`
  - `email-verification`
  - `password-reset`
  - `invite-created` (new — notify admin when invite is generated)
- Notification inbox page (`/dashboard/notifications`)
- BulkSMS delivery receipt webhook
- Preference enforcement (member can opt out of non-critical channels)

**DoD:** Payment success triggers SMS + email to member; delivery status tracked in DB; member can view notification history.

---

### M08 — Goals System

**Depends on:** M03

**Purpose:** Group financial goals — creation, discussion, locking, tracking.

**Deliverables:**
- Goal model + service (`services/goal.service.ts`)
- Goals page (`/dashboard/goals`) — active + past goals
- Goal detail page with progress bar
- Admin: create goal form (`/admin/goals/new`)
- Goal locking flow (admin-only, irreversible)
- `GoalProgress` records updated when contributions processed
- Monthly + yearly + custom goal types

**DoD:** Admin creates a goal; members can view progress; goal can be locked; locked goal cannot be edited.

---

### M09 — Reporting & Statements

**Depends on:** M05, M07

**Purpose:** Transaction history, statement PDFs, admin reports.

**Deliverables:**
- Transaction history page (`/dashboard/transactions`)
  - Filter by date range, status, type
  - Pagination
- Statement PDF generation (`@react-pdf/renderer` server-side)
  - Stored in Vercel Blob with 15-min signed URL
- Statement download endpoint (`GET /api/v1/transactions/statement`)
- Admin reports page (`/admin/reports`)
  - Total pool, monthly collection rate, per-member breakdown
  - CSV export

**DoD:** Member can download a PDF statement for any month; admin report shows total contributions for current month.

---

### M10 — WhatsApp Integration Page

**Depends on:** M01

**Purpose:** Group info page with WhatsApp deep link.

**Deliverables:**
- Public page (`/whatsapp`)
- Group name, purpose, rules summary
- Member count (from DB)
- Deep link button → WhatsApp group
- Can be updated by admin (group link stored in env / DB config)

**DoD:** Page loads without authentication; WhatsApp button deep links to correct group.

---

### M11 — Admin Dashboard

**Depends on:** M02–M10

**Purpose:** Complete admin oversight — members, finances, audit.

**Deliverables:**
- Admin dashboard (`/admin`) — summary stats: total members, pool balance, collection rate, overdue count
- Member management (`/admin/members`) — list, view, suspend, reactivate
- Member detail view — full contribution + transaction history
- Goal management (`/admin/goals`)
- Audit log viewer (`/admin/audit`)
- System health panel
- Force-debit manual trigger (emergency, admin only, with confirmation modal)

**DoD:** Admin can view all member data; can suspend a member (blocks mandate); audit log shows all admin actions.

---

### M11a — Invite & Access Control

**Depends on:** M11 (for admin UI) + patches M02 (register flow)

**Purpose:** Close open registration. Only people with a valid, admin-issued invite code can create an account. Each invite is pre-loaded with member details and tied to a specific person by email + phone.

---

#### Design Decisions

| Decision | Answer |
|---|---|
| Code delivery | Admin generates code; shares manually via WhatsApp/SMS |
| Code format | `XKM-XXXX-XXXX` (Crockford base32, ~50-bit entropy) |
| DB storage | sha256 hash of code + 4-char prefix (consistent with existing token hashing) |
| Code expiry | **7 days** from creation |
| Single-use | Yes — consumed atomically in same DB transaction as user creation |
| Binding | Invite tied to specific **email + phone** — these fields are locked in the signup form |
| Other fields | First name, last name, ID number — pre-filled but **editable** (member can correct typos; fills own SA ID) |
| Monthly amount | Admin sets the **minimum floor** — member can choose that amount or higher, never below |
| Admin ID number | Not collected on invite — member enters their own at signup |

---

#### Schema — new `Invitation` model

Add to `packages/database/prisma/schema.prisma`:

```prisma
enum InvitationStatus {
  PENDING    // created, not yet used
  ACCEPTED   // a user signed up with it
  REVOKED    // admin cancelled it
  EXPIRED    // past expiresAt (enforced at validation time)
}

model Invitation {
  id            String           @id @default(cuid())
  codeHash      String           @unique          // sha256 of plaintext code
  codePrefix    String                            // first 4 chars for admin list display
  firstName     String
  lastName      String
  email         String           @unique          // binding — locked in signup form
  phone         String           @unique          // binding — locked in signup form
  minimumAmount Decimal          @db.Decimal(10, 2)  // floor; member picks >= this
  status        InvitationStatus @default(PENDING)
  invitedById   String
  acceptedById  String?          @unique
  expiresAt     DateTime                          // createdAt + 7 days
  acceptedAt    DateTime?
  createdAt     DateTime         @default(now())

  invitedBy  User  @relation("InvitesSent",    fields: [invitedById],  references: [id])
  acceptedBy User? @relation("InviteAccepted", fields: [acceptedById], references: [id])

  @@map("invitations")
}
```

Also add back-relations on `User`:
```prisma
invitesSent     Invitation[] @relation("InvitesSent")
inviteAccepted  Invitation?  @relation("InviteAccepted")
```

---

#### Two-step signup flow

```
Step 1 — Enter code
  POST /api/v1/auth/invitations/validate
  body: { code }
  → validates: PENDING + not expired + not revoked
  → returns: { firstName, lastName, email, phone, minimumAmount }
  → rate-limited (reuse authRatelimit); added to middleware public-API allowlist

Step 2 — Complete signup
  email          (pre-filled, locked — binding)
  phone          (pre-filled, locked — binding)
  firstName      (pre-filled, editable)
  lastName       (pre-filled, editable)
  idNumber       (blank — member fills own SA ID)
  monthlyAmount  (editable, min = minimumAmount enforced by Zod)
  password       (member sets)
  consentToPopia (member checks)

  POST /api/v1/auth/register  (now requires inviteCode)
  → re-validates code (anti-race)
  → enforces submitted email + phone match invite (binding)
  → creates User + marks Invitation ACCEPTED in one db.$transaction
  → existing: email verification token + audit log
```

---

#### Deliverables

**Backend (new):**
- `Invitation` model + Prisma migration
- `services/invite.service.ts` — generate code, hash, create, validate, consume, revoke
- `POST /api/v1/auth/invitations/validate` — public, rate-limited
- `POST /api/v1/admin/invitations` — create invite (ADMIN only), returns one-time plaintext code
- `GET  /api/v1/admin/invitations` — list with status + prefix (never full code)
- `POST /api/v1/admin/invitations/[id]/revoke` — revoke an invite

**Backend (patch):**
- `packages/database/prisma/schema.prisma` — add `Invitation` model + `User` back-relations
- `lib/validation/auth.ts` — add `inviteCode` to `RegisterSchema`; add `minimumAmount` floor enforcement
- `services/auth.service.ts` — `registerUser` validates + consumes invite, enforces binding
- `apps/web/app/api/v1/auth/register/route.ts` — pass invite code through
- `middleware.ts` — add `/api/v1/auth/invitations/validate` to public-API allowlist

**Frontend (new):**
- `/auth/register` becomes 2-step: code entry → pre-filled form
- `RegisterForm.tsx` refactored to multi-step
- `/admin/invitations` page — list invites, create new, revoke

**Security properties enforced:**
- Hashed codes in DB (never stored plain)
- Single-use (atomic consume in transaction)
- 7-day expiry enforced at validate + consume
- Binding enforcement (email + phone must match invite)
- Rate-limited validate endpoint (leaked code useless without matching identity)
- Audit log: invite creation, acceptance, revocation

**DoD:** Founder can create an invite from `/admin/invitations`; system generates `XKM-XXXX-XXXX` code shown once; member uses code at `/auth/register`, sees pre-filled form, completes signup; invite status shows ACCEPTED; a second attempt with same code is rejected.

---

### M12 — PWA + Optimisation

**Depends on:** M11a

**Purpose:** Performance, PWA capability, and performance baseline for future zero-rating (v2).

**Deliverables:**
- `next-pwa` configured with service worker
- Offline fallback page
- App manifest (`manifest.json`) with XXM branding
- `next/image` optimisation on all images
- Lighthouse score ≥ 90 on mobile
- Bundle analysis + code splitting audit
- Minimal API payload audit (groundwork for v2 zero-rating)
- Brotli compression confirmed active on Vercel
- Sentry release tracking configured
- Better Stack uptime monitor configured

**Note:** Zero-rating / data-free operator applications (Vodacom, MTN, Cell C, Telkom) are scoped to **v2**. The PWA + optimisation work in M12 lays the technical foundation that will make the v2 upgrade straightforward.

**DoD:** Lighthouse mobile score ≥ 90; app installable as PWA; `/api/health` monitored with alerting.

---

## Time Estimates (Developer-Days)

| Module | Estimate | Status |
|---|---|---|
| M01 Foundation | 2 days | ✅ Done |
| M02 Auth | 3 days | ✅ Done |
| M03 Profile | 2 days | ✅ Done |
| M04 Mandates | 3 days | ✅ Done |
| M05 Contributions | 2 days | ✅ Done |
| M06 Job Engine | 3 days | ✅ Done (PR pending) |
| M07 Notifications | 2 days | ⬜ |
| M08 Goals | 2 days | ⬜ |
| M09 Reporting | 3 days | ⬜ |
| M10 WhatsApp page | 1 day | ⬜ |
| M11 Admin Dashboard | 3 days | ⬜ |
| M11a Invite & Access Control | 2 days | ⬜ |
| M12 PWA | 2 days | ⬜ |
| **Total** | **~30 developer-days** | **~15 done** |
