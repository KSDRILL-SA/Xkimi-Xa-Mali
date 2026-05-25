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
| Database | PostgreSQL via Prisma ORM |
| Auth | NextAuth.js v5 |
| Payments | Netcash (DebiCheck debit orders) |
| SMS | BulkSMS |
| Email | Resend |
| Jobs | Inngest (durable, retryable) |
| Cache / Rate limiting | Upstash Redis |
| File storage | Vercel Blob |
| Deployment | Vercel + Neon + Upstash |
| Monitoring | Sentry + Better Stack |

---

## Project Structure

```
xkimm-xa-mali/
├── apps/
│   └── web/                    # Next.js application
│       ├── app/                # App Router pages + API routes
│       │   ├── (public)/       # Homepage, WhatsApp page
│       │   ├── (auth)/         # Login, register, password reset
│       │   ├── (member)/       # Member dashboard, contributions, goals
│       │   ├── (admin)/        # Admin dashboard, member management
│       │   └── api/v1/         # REST API endpoints
│       ├── components/         # UI components
│       ├── lib/                # Clients, utilities, validation schemas
│       ├── services/           # Business logic (service layer)
│       └── types/              # Shared TypeScript types
├── packages/
│   └── database/               # Prisma schema + migrations + seed
├── docs/                       # System design documentation
│   ├── system-overview.md      # Full 6-phase system design
│   ├── erd.md                  # Entity relationships
│   ├── api-contract.yaml       # OpenAPI specification
│   ├── security-model.md       # Auth + permissions
│   ├── build-order.md          # Sequential module build plan
│   └── constitutions/          # Coding standards per layer
├── .github/workflows/          # CI/CD
├── docker-compose.yml          # Local dev (PostgreSQL + Redis)
└── .env.example                # Environment variable reference
```

---

## Getting Started (Local Development)

### Prerequisites

- Node.js 20+
- Docker + Docker Compose

### 1. Clone and install

```bash
git clone https://github.com/maluleke-ks/xkimi-xa-mali.git
cd xkimi-xa-mali
npm install
```

### 2. Configure environment

```bash
cp .env.example apps/web/.env.local
# Fill in required values — see .env.example for descriptions
```

### 3. Start local services

```bash
docker-compose up -d
```

### 4. Set up database

```bash
npm run db:generate
npm run db:migrate
npm run db:seed   # requires FOUNDER_EMAIL/PHONE/PASSWORD in .env.local
```

### 5. Start development server

```bash
npm run dev
# App: http://localhost:3000
# Prisma Studio: npm run db:studio
```

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

See [build-order.md](docs/build-order.md) for the full dependency-ordered module plan.

| Phase | Module | Status |
|---|---|---|
| M01 | Project Foundation | Complete |
| M02 | Auth System | Complete |
| M03 | Member Profile | Complete |
| M04 | Payment Mandates | Pending |
| M05 | Contribution Engine | Pending |
| M06 | Job Engine (Inngest) | Pending |
| M07 | Notification System | Pending |
| M08 | Goals System | Pending |
| M09 | Reporting & Statements | Pending |
| M10 | WhatsApp Integration | Pending |
| M11 | Admin Dashboard | Pending |
| M12 | PWA + Optimisation | Pending |

---

## Contributing

All members of the group are welcome to contribute. Follow the constitutions in `/docs/constitutions/` for all code changes.

Branch naming: `feat/`, `fix/`, `chore/`, `docs/` prefixes.
PRs target `Dev` — reviewed — merged to `main`.
