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
│   ├── web/                    # Member portal + API backend (port 3000)
│   │   ├── app/                # Next.js 15 App Router
│   │   │   ├── (auth)/         # Login, register, password reset
│   │   │   ├── (member)/       # Member dashboard, contributions, goals
│   │   │   └── api/v1/         # REST API endpoints (49 routes)
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
│   ├── architecture/           # C4 architecture diagrams
│   ├── flows/                  # Auth, payment, contribution lifecycle flows
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
