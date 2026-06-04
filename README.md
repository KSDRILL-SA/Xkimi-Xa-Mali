# Xkimm Xa Mali

> *"Blessed is the hand that giveth… It is more blessed to give than to receive."* — Acts 20:35

A private financial contribution management platform for the Xkimm Xa Mali savings group. Built for four brothers, designed to scale.

---

## What This Is

A full-featured web platform that handles:

- Monthly contribution tracking (R100 minimum per member)
- Automated DebiCheck debit orders via Netcash
- Morning warning + overdue SMS notifications
- Member dashboards with full transaction history
- Downloadable statements (PDF)
- Group financial goals (monthly, yearly, custom)
- Admin oversight — all members, all transactions, audit log
- WhatsApp group integration page

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router (TypeScript) |
| Database | PostgreSQL via Prisma ORM (hosted on Neon) |
| Auth | NextAuth.js v5 |
| Payments | Netcash (DebiCheck debit orders) |
| SMS | BulkSMS |
| Email | Resend |
| Jobs | Inngest (durable, retryable) |
| Cache / Rate limiting | Upstash Redis |
| File storage | Vercel Blob |
| Deployment | Vercel + Neon + Upstash |
| Monitoring | Sentry |

---

## Project Structure

```
xkimm-xa-mali/
├── apps/
│   ├── web/                    # Member portal + API backend (port 3000)
│   │   ├── app/                # Next.js 15 App Router
│   │   │   ├── (auth)/         # Login, register, password reset, invite
│   │   │   ├── (member)/       # Member dashboard, contributions, goals
│   │   │   └── api/v1/         # REST API endpoints (50+ routes)
│   │   ├── components/         # UI components
│   │   ├── lib/                # Clients, utilities, validation schemas
│   │   ├── services/           # Business logic (service layer)
│   │   └── inngest/            # Durable scheduled jobs
│   ├── admin/                  # Admin dashboard (port 3002)
│   │   ├── app/(dashboard)/    # Members, mandates, goals, audit, reports
│   │   ├── components/         # Admin-specific UI
│   │   └── lib/                # Auth, services, utilities
│   └── website/                # Marketing landing page (port 3001)
│       ├── app/                # Public pages (home, about)
│       └── components/         # Hero, features, CTA sections
├── packages/
│   ├── database/               # Prisma schema + migrations + seed
│   ├── types/                  # Shared TypeScript types
│   ├── ui/                     # Shared React component library
│   ├── utils/                  # Shared utilities (formatters, validators)
│   └── config/                 # Shared tsconfig, tailwind, eslint
├── docs/                       # System design documentation
│   ├── system-overview.md      # Full system design
│   ├── erd.md                  # Entity relationships
│   ├── api-contract.yaml       # OpenAPI specification
│   ├── security-model.md       # Auth + permissions
│   ├── build-order.md          # Module build plan
│   └── constitutions/          # Coding standards per layer
├── .github/workflows/          # CI/CD
└── .env.example                # Environment variable reference
```

---

## Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **npm** — bundled with Node.js
- **Neon account** — free tier works for development: [neon.tech](https://neon.tech)
- **Upstash Redis** — free tier works: [upstash.com](https://upstash.com)
- **Vercel account** — for deployment: [vercel.com](https://vercel.com)

External services you need keys for (required for full functionality):

| Service | Purpose | Sign-up |
|---|---|---|
| [Neon](https://neon.tech) | PostgreSQL database | Free tier |
| [Upstash](https://upstash.com) | Redis cache + rate limiting | Free tier |
| [Resend](https://resend.com) | Transactional email | Free tier (3k/month) |
| [BulkSMS](https://bulksms.com) | SMS notifications | Pay-as-you-go |
| [Inngest](https://inngest.com) | Durable jobs (debits, reminders) | Free tier |
| [Netcash](https://netcash.co.za) | DebiCheck debit orders | Business account |
| [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) | Statement PDF storage | Included with Vercel |
| [Sentry](https://sentry.io) | Error monitoring | Free tier |

---

## Local Development Setup

### 1. Clone and install

```bash
git clone https://github.com/maluleke-ks/xkimi-xa-mali.git
cd xkimi-xa-mali
npm install
```

### 2. Configure environment variables

Copy the example env file to each app:

```bash
cp .env.example apps/web/.env.local
cp .env.example apps/admin/.env.local
cp .env.example apps/website/.env.local
```

Open each `.env.local` and fill in the values. See the **Environment Variables Reference** section below. The minimum set needed to run locally:

- `DATABASE_URL` — your Neon connection string
- `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` — from Upstash console
- `AUTH_SECRET` + `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
- `ENCRYPTION_KEY` — generate with `openssl rand -hex 32` (must be exactly 64 hex chars)
- `NEXTAUTH_URL=http://localhost:3000` (in `apps/web/.env.local`)
- `NEXTAUTH_URL=http://localhost:3002` (in `apps/admin/.env.local`)

Set `FOUNDER_EMAIL`, `FOUNDER_PHONE`, and `FOUNDER_PASSWORD` in `apps/web/.env.local` before seeding — this creates your admin login.

### 3. Set up the database

```bash
npm run db:generate     # generate the Prisma client from the schema
npm run db:migrate      # run all pending migrations against your Neon DB
npm run db:seed         # seed roles, notification templates, and founder account
```

### 4. Start development servers

```bash
npm run dev
```

This starts all three apps in parallel:

| App | URL | Purpose |
|---|---|---|
| Member portal + API | http://localhost:3000 | Member login, dashboard, API |
| Admin dashboard | http://localhost:3002 | Admin login (use founder credentials) |
| Marketing website | http://localhost:3001 | Public landing page |

Start a single app: `npm run dev:web`, `npm run dev:admin`, or `npm run dev:website`.

**Optional — Inngest jobs (debits, reminders):** run the [Inngest dev server](https://www.inngest.com/docs/local-development) alongside the web app so scheduled functions execute locally.

Prisma Studio (visual DB browser): `npm run db:studio`

---

## Environment Variables Reference

All variables live in `apps/web/.env.local` unless noted otherwise.

| Variable | Description | Where to get it | Required |
|---|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string | Neon console → Connection Details | ✅ |
| `AUTH_SECRET` | NextAuth.js signing secret (min 32 chars) | `openssl rand -base64 32` | ✅ |
| `NEXTAUTH_SECRET` | Alias for AUTH_SECRET used by some adapters | same as AUTH_SECRET | ✅ |
| `NEXTAUTH_URL` | Full URL of this app | `http://localhost:3000` (dev) | ✅ |
| `ENCRYPTION_KEY` | AES-256 key for encrypting bank account numbers (64 hex chars) | `openssl rand -hex 32` | ✅ |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint | Upstash console | ✅ |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token | Upstash console | ✅ |
| `NETCASH_SERVICE_KEY` | Netcash API service key | Netcash merchant portal | ✅ |
| `NETCASH_WEBHOOK_SECRET` | Shared secret for webhook signature verification | Set in Netcash portal | ✅ |
| `NETCASH_API_URL` | Netcash SOAP endpoint | Sandbox: `https://ws.netcash.co.za/NSWSSX/NetcashTest.asmx` | ✅ |
| `BULKSMS_USERNAME` | BulkSMS account username | BulkSMS account settings | ✅ |
| `BULKSMS_PASSWORD` | BulkSMS account password | BulkSMS account settings | ✅ |
| `RESEND_API_KEY` | Resend API key | Resend dashboard → API Keys | ✅ |
| `RESEND_FROM_EMAIL` | Verified sender address | Must be verified in Resend | ✅ |
| `INNGEST_EVENT_KEY` | Inngest event signing key | Inngest dashboard → Keys | ✅ |
| `INNGEST_SIGNING_KEY` | Inngest webhook signing key | Inngest dashboard → Keys | ✅ |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token for PDF storage | Vercel dashboard → Storage | ✅ |
| `WHATSAPP_GROUP_LINK` | WhatsApp group invite link | WhatsApp group settings | ✅ |
| `WHATSAPP_GROUP_NAME` | Display name for the WhatsApp group | — | — |
| `ADMIN_WHATSAPP_NUMBER` | Admin WhatsApp in international format (no +) | — | — |
| `ADMIN_API_SECRET` | Secret for trusted admin→web internal API calls | `openssl rand -base64 32` | ✅ |
| `NEXT_PUBLIC_WEB_URL` | Public URL of the web app | `http://localhost:3000` (dev) | ✅ |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry DSN for error tracking | Sentry project settings | — |
| `SENTRY_AUTH_TOKEN` | Sentry auth token for source maps | Sentry account → Auth tokens | — |
| `FOUNDER_EMAIL` | Email address for the seeded admin account | Your email | Seed only |
| `FOUNDER_PHONE` | SA phone number for the seeded admin (e.g. 0821234567) | Your phone | Seed only |
| `FOUNDER_PASSWORD` | Password for the seeded admin account | Choose a strong password | Seed only |
| `MAX_LOGIN_ATTEMPTS` | Failed logins before lockout (default: 5) | — | — |
| `LOCKOUT_DURATION_MINUTES` | Lockout duration in minutes (default: 30) | — | — |

**Admin app additional variables** (`apps/admin/.env.local`):

| Variable | Description |
|---|---|
| `AUTH_SECRET` | Same secret as web app |
| `NEXTAUTH_URL` | `http://localhost:3002` (dev) |
| `WEB_INTERNAL_URL` | Internal URL of web app for server-to-server calls — `http://localhost:3000` (dev) |
| `ADMIN_API_SECRET` | Same secret as web app |

**Website app additional variables** (`apps/website/.env.local`):

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Public URL of member portal — `http://localhost:3000` (dev) |
| `NEXT_PUBLIC_ADMIN_URL` | Public URL of admin dashboard — `http://localhost:3002` (dev) |
| `NEXT_PUBLIC_SITE_URL` | Public URL of marketing website — `http://localhost:3001` (dev) |
| `NEXT_PUBLIC_WHATSAPP_GROUP_LINK` | Same as `WHATSAPP_GROUP_LINK` |

---

## Deployment (Vercel)

### 1. Create three Vercel projects

Deploy each app as a separate Vercel project:

```
apps/web      → member portal      (e.g. app.xkimmxamali.co.za)
apps/admin    → admin dashboard    (e.g. admin.xkimmxamali.co.za)
apps/website  → marketing website  (e.g. xkimmxamali.co.za)
```

In each Vercel project settings, set **Root Directory** to the app path (`apps/web`, `apps/admin`, or `apps/website`).

### 2. Set environment variables

Add all required variables from the **Environment Variables Reference** section above via Vercel's dashboard (Settings → Environment Variables). In production:

- `NEXTAUTH_URL` = your production URL (e.g. `https://app.xkimmxamali.co.za`)
- `DATABASE_URL` = your Neon connection string (use the pooled connection URL)
- `NETCASH_API_URL` = `https://ws.netcash.co.za/NSWSSX/Netcash.asmx` (production, not sandbox)

### 3. Connect Neon database

In your Neon project, use the **pooled connection string** for `DATABASE_URL` in production. Enable the Neon Vercel integration for automatic branch preview databases.

### 4. Run migrations on deploy

Vercel build command for `apps/web`:

```bash
cd ../.. && npm run db:generate && npm run db:migrate && npm run db:seed && cd apps/web && npm run build
```

This ensures every deployment runs migrations and seeds templates.

### 5. Connect Inngest

In the Inngest dashboard, create a production app and point it to `https://your-app.vercel.app/api/inngest`. Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in Vercel environment variables.

---

## Database Migrations

```bash
# Development — creates a new migration file in packages/database/prisma/migrations/
npm run db:migrate:dev

# Production — deploys pending migrations only (no migration file creation)
npm run db:migrate

# Seed reference data (idempotent — safe to run on every deploy)
npm run db:seed

# Open Prisma Studio (visual database browser)
npm run db:studio
```

---

## Running Tests

```bash
npm run test           # run all tests
npm run test:watch     # watch mode for development
npm run typecheck      # TypeScript type checking (zero errors required)
npm run lint           # ESLint (zero errors required)
```

---

## Architecture Overview

The system follows a layered architecture:

```
Browser / Mobile PWA
        ↓
Next.js App Router (Server Components + Client Components)
        ↓
Service Layer (business logic, validation, RBAC)
        ↓
Repository Layer (Prisma queries, data access)
        ↓
Neon PostgreSQL (29 models, full audit trail)
        ↑
Inngest (durable jobs: debit collection, notifications, reminders)
Upstash Redis (rate limiting, caching, idempotency keys)
Netcash (SA DebiCheck debit order mandate + collection)
BulkSMS + Resend (notifications)
Vercel Blob (statement PDFs)
```

See [docs/system-overview.md](docs/system-overview.md) for the full design document.

---

## Documentation

| Document | Description |
|---|---|
| [System Overview](docs/system-overview.md) | Full 6-phase system design |
| [ERD](docs/erd.md) | Database schema + normalisation proof |
| [API Contract](docs/api-contract.yaml) | OpenAPI specification |
| [Security Model](docs/security-model.md) | Auth strategy + permission tiers |
| [Build Order](docs/build-order.md) | Sequential module development plan |
| [Backend Constitution](docs/constitutions/backend.md) | Backend coding standards |
| [Frontend Constitution](docs/constitutions/frontend.md) | Frontend coding standards |
| [Database Constitution](docs/constitutions/database.md) | Database standards |
| [Security Constitution](docs/constitutions/security.md) | Security rules |
| [Infra Constitution](docs/constitutions/infra.md) | Infrastructure standards |

---

## Build Phases

| Phase | Module | Status |
|---|---|---|
| M01 | Project Foundation | Complete |
| M02 | Auth System | Complete |
| M03 | Member Profile | Complete |
| M04 | Payment Mandates | Complete |
| M05 | Contribution Engine | Complete |
| M06 | Job Engine (Inngest) | Complete |
| M07 | Notification System | Complete |
| M08 | Goals System | Complete |
| M09 | Reporting & Statements | Complete |
| M10 | WhatsApp Integration | Complete |
| M11 | Admin Dashboard | Complete |
| M11a | Invite & Access Control | Complete |
| M12 | PWA + Optimisation | Complete |

---

## Contributing

All members of the group are welcome to contribute. Follow the constitutions in `/docs/constitutions/` for all code changes.

Branch naming: `feat/`, `fix/`, `chore/`, `docs/` prefixes.
PRs target `Dev` — reviewed — merged to `main`.
