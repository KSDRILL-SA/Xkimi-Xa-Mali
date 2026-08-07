# Environment & Credentials Setup Plan

The plan for standing up the real environments: which accounts to open, in what
order, what each one blocks, and which values must match each other.

This is the **what and why, in what order**. [`DEPLOYMENT.md`](../DEPLOYMENT.md)
is the **how**, once the accounts exist. Read this first.

Written 2026-07-26. Nothing here has been done yet — every item is outstanding.

---

## 0. Starting position

Three decisions were settled before this plan was written:

| Question | Answer | Consequence |
|---|---|---|
| Domain | **Not registered yet** | Step 1. Four other things queue behind DNS. |
| Environments | **Staging + production** | Two of everything: Neon branches, Redis, Inngest apps, env sets. |
| Netcash | **Not applied yet** | The long pole. Start it the same day as the domain. |

The code is ready: three apps build, 731 tests pass, migrations apply with no
drift. What is left is entirely accounts, credentials and DNS — which is why
this is a checklist for a person rather than work that can be automated.

---

## 1. Topology

The branch mapping follows the existing git workflow — PRs into `Dev`, `main` is
production — so no new habits are needed.

| Branch | Environment | Neon branch | Vercel env | Payment gateway |
|---|---|---|---|---|
| `Dev` | staging | `staging` | Preview | `mock`, then Netcash **test** when credentials arrive |
| `main` | production | `production` | Production | Netcash **live** |

Three Vercel projects per app, each pointed at this monorepo with a different
root directory (`apps/web`, `apps/admin`, `apps/website`). Install command is
`npm ci` at the repo root.

**The marketing site holds no secrets.** Five `NEXT_PUBLIC_*` values and nothing
else. It is the one app that can be deployed without ceremony.

---

## 2. Critical path

Only one item cannot be compressed. Everything else is a day's work.

| Item | Lead time | Blocks |
|---|---|---|
| **Netcash DebiCheck onboarding** | **Weeks.** Needs a registered entity, a business bank account and FICA documents | Live money only — and the adapter needs rebuilding, see §2.5 of the [completion guide](./completion-guide.md) |
| Domain registration (`.co.za`) | Hours | DNS, email verification, webhook URL, every app URL |
| Resend domain verification | Minutes to 48h after DNS records | Email delivery |
| BulkSMS account + sender ID | Days, if sender ID approval is needed | SMS delivery |
| Neon, Vercel, Upstash, Inngest, Sentry, Blob | Minutes each | — |
| GitHub Pro | Minutes | Restores CI and unlocks branch protection |

**Start Netcash onboarding and register the domain on the same day.** Nothing
else on this list is worth optimising.

### Netcash is not on the critical path for everything

Staging can run on the mock gateway, so the other eleven integrations can be
built and verified in full while Netcash onboarding proceeds. This only works
because the mock guard keys on `VERCEL_ENV`, not `NODE_ENV` — see §6.

Order of use: **mock** (build everything) → **Netcash test** (dry run, §6 of
`DEPLOYMENT.md`) → **Netcash live** (production).

---

### Applying to Netcash — what to walk away with

Onboarding runs a credit check on the business **and on every director or
member**, alongside FICA documents and proof of identity. Registering the entity
and opening its bank account is the real bottleneck, not the application form.

Apply through [netcash.co.za](https://netcash.co.za/services/debicheck/); they
route you to a payment advisor rather than a self-serve signup. Ask for DebiCheck
collections with integration access, and for **sandbox credentials first**.

Ask for each of these by name, and do not consider onboarding finished without
them:

| What to ask for | Maps to |
|---|---|
| Merchant Account ID | — |
| **Debit Order Service Key** | `NETCASH_SERVICE_KEY` |
| Account Service Key | — |
| NetConnector access | where the postback URL is configured |
| Sandbox credentials, separate from live | staging |
| **The current webhook source IP list** | `NETCASH_WEBHOOK_IPS` |
| **The API specification for your account** | decides how much of `lib/netcash.ts` is rewritten |

Also ask what your mandate limits are, the collection-day cut-offs, and
settlement timing — those three drive the debit-run schedule.

## 3. Accounts to open

| Service | What it provides | Needs the domain first? |
|---|---|---|
| Domain registrar (`.co.za`) | The domain and DNS | — |
| Neon | Postgres, one project with `staging` + `production` branches | No |
| Vercel | Three projects, both environments | For custom domains |
| Netcash | DebiCheck mandates and debits | For the webhook URL |
| Resend | Transactional email | **Yes** — sender domain verification |
| BulkSMS | SMS to members | No |
| Upstash | Redis for rate limiting, one per environment | No |
| Inngest | The 16 scheduled jobs, one app per environment | For the serve endpoint |
| Sentry | Error reporting | No |
| Vercel Blob | PDF statements, signature images | No |
| GitHub Pro | CI minutes, branch protection | No |

---

## 4. The secret matrix

Getting a value *wrong* is loud. Getting the **match/differ relationships**
wrong is quiet, and that is where the real risk sits.

| Secret | web | admin | website | Rule |
|---|:--:|:--:|:--:|---|
| `ENCRYPTION_KEY` | ✅ | — | — | **Set once, never change.** Different per environment. |
| `AUTH_SECRET` | ✅ | ✅ | — | **Identical** across web+admin *within* an environment; different *between* environments |
| `ADMIN_API_SECRET` | ✅ | ✅ | — | **Identical** across web+admin within an environment |
| `DATABASE_URL` | ✅ | ✅ | — | Same within an environment. The **pooled** Neon string |
| `DIRECT_DATABASE_URL` | migrations only | — | — | The **unpooled** Neon string |
| Netcash, BulkSMS, Resend, Inngest, Blob | ✅ | — | — | Member app only |
| `UPSTASH_*`, `SENTRY_*` | ✅ | ✅ | — | Separate instances per environment |
| `NEXT_PUBLIC_*` | ✅ | ✅ | ✅ | Public. Inlined at **build** time — setting them after a deploy does nothing |

### `ENCRYPTION_KEY` is the one that cannot be recovered

It decrypts stored bank account and ID numbers. Lose it and that data is
permanently unreadable; rotate it and the same thing happens. Vercel's
environment store must not be its only home — put it in a password manager
**before** pasting it anywhere, and never reuse the staging key in production.

### Pooled vs unpooled

The app runs on Neon's **pooled** endpoint (`-pooler` in the host). Migrations
cannot: a pooler multiplexes statements across backends, so the advisory lock
`prisma migrate` depends on does not survive. `DIRECT_DATABASE_URL` is the
unpooled endpoint and is used for migrations only. Both are required —
`prisma validate` fails without the second.

---

## 5. Sequence

Each phase has a gate. Do not start the next one until the gate passes.

### Phase 1 — Foundations (day 1)
1. Start **Netcash DebiCheck onboarding**. It is the long pole; everything else
   can proceed in parallel.
2. Register the **domain**.
3. Fix the domain in code (§7) and set the DNS records.

*Gate: the domain resolves.*

### Phase 2 — Staging (day 1–2)
4. Neon project, `staging` branch. Note both connection strings.
5. `prisma migrate deploy` against staging, then `npm run db:seed`.
6. Three Vercel projects, Preview environment variables set from `.env.example`.
7. Upstash, Inngest, Sentry and Blob for staging. Register the Inngest serve
   endpoint: `https://<staging-app>/api/v1/webhooks/inngest`.
8. Resend: add the domain, publish the DNS records, wait for verification.
9. `PAYMENT_GATEWAY=mock` on staging.

*Gate: all three staging URLs serve; `/api/v1/health` returns 200 with
`db: ok` and Redis configured; a scheduled job appears in the Inngest dashboard.*

### Phase 3 — Exercise it (whenever staging is up)
10. Walk the full member journey on staging against the mock gateway: invite →
    register → bank account → mandate → contribution → statement PDF.

*Gate: the journey completes and the inbox, email and SMS all arrive.*

### Phase 4 — Netcash test (when credentials arrive)
11. Switch staging to the Netcash **test** endpoint with the sandbox keys.
12. Register the webhook URL and **confirm the source IPs** with Netcash — see
    the warning in §7.
13. Run the dry run in §6 of `DEPLOYMENT.md` end to end, including a reversal.

*Gate: every box in that checklist is ticked.*

### Phase 5 — Production
14. Neon `production` branch, migrate, seed.
15. Production Vercel environment variables — **new secrets, not the staging
    ones**, except where §4 says they must match.
16. Netcash **live** keys and the production API URL.
17. Custom domains, then the smoke test in §7 of `DEPLOYMENT.md`.
18. Soft launch with the four founders. Watch. Then open to members.

---

## 6. Two things that will bite if forgotten

### Staging must not contact real people

Staging shares no data with production, but it shares the *outside world*.
Seeded staging members with real phone numbers and email addresses will receive
real SMS and real email — there are sixteen scheduled jobs, several of them
daily. Before seeding staging, either use unroutable contact details or point it
at a separate Resend sender and BulkSMS test account.

### Migrations are a deliberate step, not part of the build

`prisma migrate deploy` is not run by the Vercel build and should not be. Run it
yourself, against a known database, before promoting the deployment. For a
platform that moves money, a schema change triggered by a `git push` is not a
convenience.

---

## 7. Code items this plan depends on

Already done (2026-07-26):

- Every credential the runbook calls critical is now **enforced by the build**.
  A half-configured production deploy fails with the missing names printed
  rather than starting and failing quietly later.
- Strictness keys on `isLiveDeployment()` (`@xxm/utils/deployment`), resolving
  `DEPLOY_ENV` → `VERCEL_ENV` → `NODE_ENV`. This is what allows staging to exist
  before production credentials do.
- No hardcoded domain, WhatsApp invite link, phone number or `localhost`
  fallback remains in application code.
- `directUrl` on the Prisma datasource.

Still outstanding:

- **The domain, in three places.** The repo currently disagrees with itself —
  `DEPLOYMENT.md` used `xkimmxamali.co.za`, the website app defaulted to
  `xkimimamali.co.za`, and the Resend from-address used a third spelling. The
  hardcoded values are gone and the docs now say `<your-domain>`, but once the
  real domain is registered it must be set in the environment variables of all
  three Vercel projects.
- **`NETCASH_WEBHOOK_IPS`.** `apps/web/lib/netcash.ts` falls back to four
  built-in Netcash source IPs. If the real ones differ, **every callback is
  rejected while the debits still collect** — money moves and nothing records it.
  Confirm the current list with Netcash during onboarding and set the variable if
  it differs. This is the single highest-consequence item on the page.
- **GitHub Pro.** CI has not executed since 2026-05-25 — every run since is a
  startup failure from exhausted Actions minutes on the private repo. Until that
  is restored, nothing verifies a merge except a local run.

---

## 8. Where things are written down

| Document | Covers |
|---|---|
| This file | Which accounts, in what order, and which values relate to each other |
| [`DEPLOYMENT.md`](../DEPLOYMENT.md) | Go-live runbook: Vercel setup, the dry run, the smoke test, rollback |
| [`.env.example`](../.env.example) | The authoritative list of every variable, with notes on each |
| [`runbook.md`](./runbook.md) | Incident response once it is live: failed debits, stuck webhooks, reconciliation |
