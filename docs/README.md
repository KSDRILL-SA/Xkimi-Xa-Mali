# Xkimm Xa Mali — Documentation Index

| | |
|---|---|
| **System** | Xkimm Xa Mali (XXM) — Family savings group management |
| **Platform** | Next.js 15 · PostgreSQL · Vercel |
| **Classification** | Financial + PII — highest sensitivity |

---

## Start Here

| Document | Purpose |
|---|---|
| [system-overview.md](./system-overview.md) | Full architecture: tech stack, bounded contexts, data flow, security model, build phases |
| [requirements.md](./requirements.md) | All 58 FRs + 56 NFRs + constraints + v2 scope |
| [build-order.md](./build-order.md) | Module build sequence M01–M12, Phase 2 production hardening record |
| [api-contract.yaml](./api-contract.yaml) | OpenAPI 3.1 spec for all `/api/v1/` endpoints |

---

## Architecture Decision Records

Rationale for non-obvious technology choices.

| ADR | Decision | Status |
|---|---|---|
| [adr/001-netcash-over-payfast.md](./adr/001-netcash-over-payfast.md) | Netcash over PayFast for recurring debit orders | Accepted |
| [adr/002-inngest-job-engine.md](./adr/002-inngest-job-engine.md) | Inngest over Vercel Cron for the job engine | Accepted |
| [adr/003-neon-over-supabase.md](./adr/003-neon-over-supabase.md) | Neon over Supabase for PostgreSQL hosting | Accepted |

---

## Database

| Document | Purpose |
|---|---|
| [database/01-erd.md](./database/01-erd.md) | Full entity-relationship diagram |
| [database/02-normalization.md](./database/02-normalization.md) | 3NF normalisation proof for every table |
| [database/03-schema-design.md](./database/03-schema-design.md) | Schema decisions — enums, indexes, constraints |

---

## Security

| Document | Purpose |
|---|---|
| [security/01-security-architecture.md](./security/01-security-architecture.md) | Full security model: threat model, auth flow, encryption, POPIA compliance |

---

## Data Flows

Sequence diagrams for every major system flow.

| Document | Flow |
|---|---|
| [flows/01-auth-flow.md](./flows/01-auth-flow.md) | Login, JWT refresh, logout |
| [flows/02-debit-run-flow.md](./flows/02-debit-run-flow.md) | Monthly debit collection pipeline |
| [flows/03-mandate-setup-flow.md](./flows/03-mandate-setup-flow.md) | DebiCheck mandate submission and confirmation |
| [flows/04-contribution-lifecycle.md](./flows/04-contribution-lifecycle.md) | Contribution state machine: PENDING → PAID / OVERDUE |
| [flows/05-invite-registration-flow.md](./flows/05-invite-registration-flow.md) | Member invitation and onboarding |
| [flows/06-pdf-statement-flow.md](./flows/06-pdf-statement-flow.md) | PDF generation and signed URL delivery |

---

## Constitutions

Rules every contributor must follow. Non-negotiable.

| Document | Domain |
|---|---|
| [constitutions/backend.md](./constitutions/backend.md) | API handler pattern, service layer, error hierarchy |
| [constitutions/frontend.md](./constitutions/frontend.md) | Server vs. client components, form patterns, state management |
| [constitutions/database.md](./constitutions/database.md) | Schema rules, migration naming, ON DELETE contracts |
| [constitutions/security.md](./constitutions/security.md) | Security defence layers, SEC rules |
| [constitutions/infra.md](./constitutions/infra.md) | Environment tiers, CI/CD pipeline, deployment rules |

---

## Operations

| Document | Purpose |
|---|---|
| [runbook.md](./runbook.md) | Incident response: failed debit runs, stuck transactions, emergency procedures |

---

## Contributing

See [`/CONTRIBUTING.md`](../CONTRIBUTING.md) at the repo root for the full contribution guide.

---

## Diagram Legend

All architecture diagrams use [Mermaid](https://mermaid.js.org/). Rendered natively on GitHub.

```
flowchart    → component relationships, data flows, decision trees
sequenceDiagram → time-ordered interactions between services
erDiagram    → database entity relationships
mindmap      → hierarchical breakdowns
```
